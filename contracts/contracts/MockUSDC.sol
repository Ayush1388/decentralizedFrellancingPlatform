// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only stand-in for USDC (6 decimals) with an open faucet. Never deploy on mainnet.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin (mock)", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone can mint test tokens to themselves, capped per call so a faucet click is realistic.
    function faucet(uint256 amount) external {
        require(amount <= 100_000 * 1e6, "faucet: max 100,000 per call");
        _mint(msg.sender, amount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
