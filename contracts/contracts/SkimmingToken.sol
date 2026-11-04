// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only token that burns 1% of every transfer, to prove JobEscrow rejects such tokens.
contract SkimmingToken is ERC20 {
    constructor() ERC20("Skimming", "SKIM") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 cut = value / 100;
            super._update(from, address(0), cut);
            value -= cut;
        }
        super._update(from, to, value);
    }
}
