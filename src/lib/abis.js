import { parseAbi } from "viem";

// The slice of ERC-20 the app uses; `faucet` only exists on the local MockUSDC.
export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet(uint256 amount)",
]);
