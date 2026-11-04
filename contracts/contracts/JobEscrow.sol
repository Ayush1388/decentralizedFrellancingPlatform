// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title JobEscrow
/// @notice Milestone escrow for freelance work, paid in a single ERC-20 (USDC).
///
/// Lifecycle of one milestone:
///
///   Pending --fund--> Funded --submit--> Submitted --approve/claim--> Released
///                        |   ^               |  |
///                        |   +-requestChanges+  +--dispute--> Disputed --resolve--> Resolved
///                        +--refund (after refundAfter, no delivery)--> Refunded
///
/// Money rules:
///  - The client funds a milestone before work starts; tokens sit in this contract.
///  - Payouts are credited to `withdrawable` and pulled with `withdraw()`, so a hostile
///    receiver can never block a state transition.
///  - The platform fee is taken only from the freelancer's share, at release time.
///  - `pause()` stops new money entering (createEscrow, fund). Every exit path stays open,
///    so a pause can never trap funds.
///  - The arbiter can only split a disputed milestone between the two parties.
///  - The fee and both waiting windows are copied into each escrow when it is created, so the
///    owner can never change the terms of work that is already under way.
///  - A disputed milestone can never be frozen forever: if the arbiter has not ruled after DISPUTE_TIMEOUT,
///    either party can settle it 50/50 with resolveStale().
///  - The final split of every settled milestone is stored on-chain (freelancerBps), so any off-chain
///    index can be rebuilt from the contract alone.
///  - A client can send work back for changes at most MAX_REVISIONS times per milestone; after
///    that the only ways forward are approve, claim (after silence) or dispute.
contract JobEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Pending,
        Funded,
        Submitted,
        Released,
        Refunded,
        Disputed,
        Resolved
    }

    struct Milestone {
        uint128 amount;
        Status status;
        uint8 revisions; // how many times the client sent the work back
        uint16 freelancerBps; // share of the amount the freelancer got: 10000 released, 0 refunded, the ruling when resolved
        uint64 fundedAt; // restarts when changes are requested, so the freelancer gets a fresh refund window
        uint64 submittedAt;
        uint64 disputedAt;
        bytes32 deliverable; // keccak256 of the deliverable link the freelancer submitted
    }

    struct Escrow {
        address client;
        uint32 milestoneCount;
        uint32 claimAfter; // terms copied from the global settings at creation
        uint32 refundAfter;
        address freelancer;
        uint16 feeBps;
    }

    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint32 public constant MIN_WINDOW = 1 days;
    uint32 public constant MAX_WINDOW = 90 days;
    uint256 public constant MAX_MILESTONES = 20;
    uint8 public constant MAX_REVISIONS = 3;
    uint32 public constant DISPUTE_TIMEOUT = 30 days;

    IERC20 public immutable token;

    address public arbiter;
    address public treasury;
    uint16 public feeBps;
    // Defaults for NEW escrows. Each escrow keeps the values it was created with.
    uint32 public claimAfter; // freelancer may claim a submitted milestone after this long without a client response
    uint32 public refundAfter; // client may reclaim a funded milestone after this long without a submission

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private _escrows;
    mapping(uint256 => mapping(uint256 => Milestone)) private _milestones;
    mapping(address => uint256) public withdrawable;

    event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint128[] amounts);
    event MilestoneFunded(uint256 indexed escrowId, uint256 indexed index, uint128 amount);
    event WorkSubmitted(uint256 indexed escrowId, uint256 indexed index, bytes32 deliverable);
    event ChangesRequested(uint256 indexed escrowId, uint256 indexed index, uint8 revision);
    event MilestoneReleased(uint256 indexed escrowId, uint256 indexed index, uint128 freelancerAmount, uint128 fee);
    event MilestoneRefunded(uint256 indexed escrowId, uint256 indexed index, uint128 amount);
    event MilestoneDisputed(uint256 indexed escrowId, uint256 indexed index, address indexed openedBy);
    event MilestoneResolved(uint256 indexed escrowId, uint256 indexed index, uint16 freelancerBps, uint128 freelancerAmount, uint128 clientAmount, uint128 fee);
    event Withdrawn(address indexed account, uint256 amount);
    event ArbiterChanged(address indexed arbiter);
    event TreasuryChanged(address indexed treasury);
    event FeeChanged(uint16 feeBps);
    event WindowsChanged(uint32 claimAfter, uint32 refundAfter);

    error NotClient();
    error NotFreelancer();
    error NotParty();
    error NotArbiter();
    error UnknownEscrow();
    error UnknownMilestone();
    error BadStatus(Status current);
    error TooEarly(uint256 availableAt);
    error InvalidParams();
    error NothingToWithdraw();
    error TooManyRevisions();
    error UnexpectedTransferAmount();

    constructor(IERC20 token_, address arbiter_, address treasury_, uint16 feeBps_) Ownable(msg.sender) {
        if (address(token_) == address(0) || arbiter_ == address(0) || treasury_ == address(0) || feeBps_ > MAX_FEE_BPS) {
            revert InvalidParams();
        }
        token = token_;
        arbiter = arbiter_;
        treasury = treasury_;
        feeBps = feeBps_;
        claimAfter = 7 days;
        refundAfter = 14 days;
    }

    // ---------------------------------------------------------------- views

    function getEscrow(uint256 escrowId) external view returns (address client, address freelancer, uint32 milestoneCount) {
        Escrow storage e = _escrow(escrowId);
        return (e.client, e.freelancer, e.milestoneCount);
    }

    /// @notice The fee and waiting windows this escrow was created with.
    function getTerms(uint256 escrowId) external view returns (uint16 feeBps_, uint32 claimAfter_, uint32 refundAfter_) {
        Escrow storage e = _escrow(escrowId);
        return (e.feeBps, e.claimAfter, e.refundAfter);
    }

    function getMilestone(uint256 escrowId, uint256 index) external view returns (Milestone memory) {
        _escrow(escrowId);
        return _milestoneAt(escrowId, index);
    }

    // ------------------------------------------------------------- lifecycle

    /// @notice Open an escrow between the caller (client) and a freelancer. Nothing is funded yet.
    function createEscrow(address freelancer, uint128[] calldata amounts) external whenNotPaused returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidParams();
        if (amounts.length == 0 || amounts.length > MAX_MILESTONES) revert InvalidParams();

        escrowId = nextEscrowId++;
        _escrows[escrowId] = Escrow({
            client: msg.sender,
            milestoneCount: uint32(amounts.length),
            claimAfter: claimAfter,
            refundAfter: refundAfter,
            freelancer: freelancer,
            feeBps: feeBps
        });
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert InvalidParams();
            _milestones[escrowId][i].amount = amounts[i];
        }
        emit EscrowCreated(escrowId, msg.sender, freelancer, amounts);
    }

    /// @notice Client locks the milestone's tokens in escrow. Needs a prior ERC-20 approval.
    function fund(uint256 escrowId, uint256 index) external whenNotPaused nonReentrant {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client) revert NotClient();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Pending) revert BadStatus(m.status);

        m.status = Status.Funded;
        m.fundedAt = uint64(block.timestamp);
        // Credit only what actually arrived, so a token that skims transfers can never leave the contract insolvent.
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), m.amount);
        if (token.balanceOf(address(this)) - before != m.amount) revert UnexpectedTransferAmount();
        emit MilestoneFunded(escrowId, index, m.amount);
    }

    /// @notice Freelancer marks the work delivered. `deliverable` is the keccak256 of the link they share off-chain.
    function submit(uint256 escrowId, uint256 index, bytes32 deliverable) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.freelancer) revert NotFreelancer();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Funded) revert BadStatus(m.status);
        if (deliverable == bytes32(0)) revert InvalidParams();

        m.status = Status.Submitted;
        m.submittedAt = uint64(block.timestamp);
        m.deliverable = deliverable;
        emit WorkSubmitted(escrowId, index, deliverable);
    }

    /// @notice Client sends submitted work back. The money stays locked; the freelancer gets a fresh
    /// refund window to redeliver, so this can never be used to turn a delivery into an instant refund.
    function requestChanges(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client) revert NotClient();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Submitted) revert BadStatus(m.status);
        if (m.revisions >= MAX_REVISIONS) revert TooManyRevisions();

        m.revisions += 1;
        m.status = Status.Funded;
        m.fundedAt = uint64(block.timestamp);
        m.submittedAt = 0;
        m.deliverable = bytes32(0);
        emit ChangesRequested(escrowId, index, m.revisions);
    }

    /// @notice Client accepts the work; the freelancer's payout becomes withdrawable.
    function approve(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client) revert NotClient();
        _release(e, escrowId, index);
    }

    /// @notice Freelancer collects a submitted milestone the client has ignored for `claimAfter`.
    function claim(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.freelancer) revert NotFreelancer();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Submitted) revert BadStatus(m.status);
        uint256 availableAt = uint256(m.submittedAt) + e.claimAfter;
        if (block.timestamp < availableAt) revert TooEarly(availableAt);
        _release(e, escrowId, index);
    }

    /// @notice Client reclaims a funded milestone the freelancer never delivered within `refundAfter`.
    function refund(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client) revert NotClient();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Funded) revert BadStatus(m.status);
        uint256 availableAt = uint256(m.fundedAt) + e.refundAfter;
        if (block.timestamp < availableAt) revert TooEarly(availableAt);

        m.status = Status.Refunded;
        m.freelancerBps = 0;
        withdrawable[e.client] += m.amount;
        emit MilestoneRefunded(escrowId, index, m.amount);
    }

    /// @notice Either party freezes a funded or submitted milestone until the arbiter rules.
    function dispute(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Funded && m.status != Status.Submitted) revert BadStatus(m.status);

        m.status = Status.Disputed;
        m.disputedAt = uint64(block.timestamp);
        emit MilestoneDisputed(escrowId, index, msg.sender);
    }

    /// @notice Arbiter splits a disputed milestone. `freelancerBps` of the amount goes to the freelancer
    /// (less the platform fee on that share); the rest returns to the client.
    function resolve(uint256 escrowId, uint256 index, uint16 freelancerBps) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (freelancerBps > 10_000) revert InvalidParams();
        _settle(escrowId, index, freelancerBps);
    }

    /// @notice If the arbiter has not ruled within DISPUTE_TIMEOUT, either party can split the milestone 50/50
    /// (the fee still comes out of the freelancer's half). This keeps funds from being frozen by an absent arbiter.
    function resolveStale(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Disputed) revert BadStatus(m.status);
        uint256 availableAt = uint256(m.disputedAt) + DISPUTE_TIMEOUT;
        if (block.timestamp < availableAt) revert TooEarly(availableAt);
        _settle(escrowId, index, 5_000);
    }

    /// @notice Pull whatever has been credited to the caller.
    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ----------------------------------------------------------------- admin

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setArbiter(address arbiter_) external onlyOwner {
        if (arbiter_ == address(0)) revert InvalidParams();
        arbiter = arbiter_;
        emit ArbiterChanged(arbiter_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidParams();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @dev Applies to escrows created from now on. Existing escrows keep the fee they were created with.
    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidParams();
        feeBps = feeBps_;
        emit FeeChanged(feeBps_);
    }

    /// @dev Applies to escrows created from now on, like the fee.
    function setWindows(uint32 claimAfter_, uint32 refundAfter_) external onlyOwner {
        if (claimAfter_ < MIN_WINDOW || claimAfter_ > MAX_WINDOW || refundAfter_ < MIN_WINDOW || refundAfter_ > MAX_WINDOW) {
            revert InvalidParams();
        }
        claimAfter = claimAfter_;
        refundAfter = refundAfter_;
        emit WindowsChanged(claimAfter_, refundAfter_);
    }

    // -------------------------------------------------------------- internals

    function _settle(uint256 escrowId, uint256 index, uint16 freelancerBps) private {
        Escrow storage e = _escrow(escrowId);
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Disputed) revert BadStatus(m.status);

        m.status = Status.Resolved;
        m.freelancerBps = freelancerBps;
        uint128 freelancerShare = uint128((uint256(m.amount) * freelancerBps) / 10_000);
        uint128 clientShare = m.amount - freelancerShare;
        uint128 fee = _credit(e, freelancerShare, clientShare);
        emit MilestoneResolved(escrowId, index, freelancerBps, freelancerShare - fee, clientShare, fee);
    }

    function _release(Escrow storage e, uint256 escrowId, uint256 index) private {
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Submitted) revert BadStatus(m.status);
        m.status = Status.Released;
        m.freelancerBps = 10_000;
        uint128 fee = _credit(e, m.amount, 0);
        emit MilestoneReleased(escrowId, index, m.amount - fee, fee);
    }

    /// @dev Credits the freelancer (minus fee), the treasury (fee) and the client. Returns the fee.
    function _credit(Escrow storage e, uint128 freelancerShare, uint128 clientShare) private returns (uint128 fee) {
        fee = uint128((uint256(freelancerShare) * e.feeBps) / 10_000);
        if (fee > 0) withdrawable[treasury] += fee;
        if (freelancerShare > fee) withdrawable[e.freelancer] += freelancerShare - fee;
        if (clientShare > 0) withdrawable[e.client] += clientShare;
    }

    function _escrow(uint256 escrowId) private view returns (Escrow storage e) {
        e = _escrows[escrowId];
        if (e.client == address(0)) revert UnknownEscrow();
    }

    function _milestoneAt(uint256 escrowId, uint256 index) private view returns (Milestone storage m) {
        if (index >= _escrows[escrowId].milestoneCount) revert UnknownMilestone();
        m = _milestones[escrowId][index];
    }
}
