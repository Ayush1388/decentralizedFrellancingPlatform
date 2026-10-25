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
///                        |                   |
///                        |                   +--dispute--> Disputed --resolve--> Resolved
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
        uint64 fundedAt;
        uint64 submittedAt;
        bytes32 deliverable; // keccak256 of the deliverable link the freelancer submitted
    }

    struct Escrow {
        address client;
        address freelancer;
        uint32 milestoneCount;
    }

    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint32 public constant MIN_WINDOW = 1 days;
    uint32 public constant MAX_WINDOW = 90 days;
    uint256 public constant MAX_MILESTONES = 20;

    IERC20 public immutable token;

    address public arbiter;
    address public treasury;
    uint16 public feeBps;
    uint32 public claimAfter; // freelancer may claim a submitted milestone after this long without a client response
    uint32 public refundAfter; // client may reclaim a funded milestone after this long without a submission

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private _escrows;
    mapping(uint256 => mapping(uint256 => Milestone)) private _milestones;
    mapping(address => uint256) public withdrawable;

    event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint128[] amounts);
    event MilestoneFunded(uint256 indexed escrowId, uint256 indexed index, uint128 amount);
    event WorkSubmitted(uint256 indexed escrowId, uint256 indexed index, bytes32 deliverable);
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
        _escrows[escrowId] = Escrow({client: msg.sender, freelancer: freelancer, milestoneCount: uint32(amounts.length)});
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
        token.safeTransferFrom(msg.sender, address(this), m.amount);
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
        uint256 availableAt = uint256(m.submittedAt) + claimAfter;
        if (block.timestamp < availableAt) revert TooEarly(availableAt);
        _release(e, escrowId, index);
    }

    /// @notice Client reclaims a funded milestone the freelancer never delivered within `refundAfter`.
    function refund(uint256 escrowId, uint256 index) external {
        Escrow storage e = _escrow(escrowId);
        if (msg.sender != e.client) revert NotClient();
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Funded) revert BadStatus(m.status);
        uint256 availableAt = uint256(m.fundedAt) + refundAfter;
        if (block.timestamp < availableAt) revert TooEarly(availableAt);

        m.status = Status.Refunded;
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
        emit MilestoneDisputed(escrowId, index, msg.sender);
    }

    /// @notice Arbiter splits a disputed milestone. `freelancerBps` of the amount goes to the freelancer
    /// (less the platform fee on that share); the rest returns to the client.
    function resolve(uint256 escrowId, uint256 index, uint16 freelancerBps) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (freelancerBps > 10_000) revert InvalidParams();
        Escrow storage e = _escrow(escrowId);
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Disputed) revert BadStatus(m.status);

        m.status = Status.Resolved;
        uint128 freelancerShare = uint128((uint256(m.amount) * freelancerBps) / 10_000);
        uint128 clientShare = m.amount - freelancerShare;
        uint128 fee = _credit(e, freelancerShare, clientShare);
        emit MilestoneResolved(escrowId, index, freelancerBps, freelancerShare - fee, clientShare, fee);
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

    /// @dev Applies to milestones released from now on; funded milestones keep no locked-in rate.
    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidParams();
        feeBps = feeBps_;
        emit FeeChanged(feeBps_);
    }

    function setWindows(uint32 claimAfter_, uint32 refundAfter_) external onlyOwner {
        if (claimAfter_ < MIN_WINDOW || claimAfter_ > MAX_WINDOW || refundAfter_ < MIN_WINDOW || refundAfter_ > MAX_WINDOW) {
            revert InvalidParams();
        }
        claimAfter = claimAfter_;
        refundAfter = refundAfter_;
        emit WindowsChanged(claimAfter_, refundAfter_);
    }

    // -------------------------------------------------------------- internals

    function _release(Escrow storage e, uint256 escrowId, uint256 index) private {
        Milestone storage m = _milestoneAt(escrowId, index);
        if (m.status != Status.Submitted) revert BadStatus(m.status);
        m.status = Status.Released;
        uint128 fee = _credit(e, m.amount, 0);
        emit MilestoneReleased(escrowId, index, m.amount - fee, fee);
    }

    /// @dev Credits the freelancer (minus fee), the treasury (fee) and the client. Returns the fee.
    function _credit(Escrow storage e, uint128 freelancerShare, uint128 clientShare) private returns (uint128 fee) {
        fee = uint128((uint256(freelancerShare) * feeBps) / 10_000);
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
