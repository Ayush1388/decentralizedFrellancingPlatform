import { useCallback, useState } from "react";
import { useConfig } from "wagmi";
import { connect, getAccount, readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { keccak256, toHex } from "viem";
import escrowAbi from "../contracts/JobEscrow.abi.json";
import { erc20Abi } from "./abis";
import { useChainConfig } from "../context/useChainConfig";

// Turns wallet/viem errors into something a person can act on.
export function friendlyError(err) {
  const msg = err?.shortMessage || err?.message || String(err);
  if (err?.name === "UserRejectedRequestError" || /user rejected|denied/i.test(msg)) return "You cancelled the request in your wallet.";
  if (/TooEarly/.test(msg)) return "It is too early for that. The waiting period has not ended yet.";
  if (/BadStatus/.test(msg)) return "This milestone is not in the right state for that action.";
  if (/NotClient|NotFreelancer|NotParty|NotArbiter/.test(msg)) return "This wallet is not allowed to do that. Switch to the wallet linked to your account.";
  if (/insufficient funds/i.test(msg)) return "Your wallet does not have enough ETH to pay for gas.";
  if (/exceeds balance|transfer amount exceeds/i.test(msg)) return "Your wallet does not have enough USDC for this.";
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

// Sends transactions to the JobEscrow contract from the user's wallet and waits for them to confirm.
// The caller then hands the returned hash to the API, which verifies it before updating anything.
export function useEscrow() {
  const config = useConfig();
  const chain = useChainConfig();
  const [step, setStep] = useState("");

  const ensureWallet = useCallback(async () => {
    if (!chain) throw new Error("On-chain escrow is not enabled on this server.");
    let acct = getAccount(config);
    if (!acct.isConnected) {
      if (!config.connectors.length) throw new Error("No browser wallet found. Install MetaMask to continue.");
      setStep("Connect your wallet…");
      await connect(config, { connector: config.connectors[0] });
      acct = getAccount(config);
    }
    if (acct.chainId !== chain.chainId) {
      setStep("Switch network in your wallet…");
      await switchChain(config, { chainId: chain.chainId });
    }
    return getAccount(config).address;
  }, [config, chain]);

  const send = useCallback(
    async (address, abi, functionName, args) => {
      setStep("Confirm in your wallet…");
      const hash = await writeContract(config, { address, abi, functionName, args });
      setStep("Waiting for the network to confirm…");
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
      return hash;
    },
    [config],
  );

  // kind: create | fund | submit | approve | claim | refund | dispute | resolve | withdraw
  const onchain = useCallback(
    async (kind, { escrowId, index, amount, freelancer, amounts, deliverableUrl, freelancerPercent } = {}) => {
      try {
        const account = await ensureWallet();
        const escrow = chain.escrow;
        const id = escrowId !== undefined ? BigInt(escrowId) : undefined;
        const i = index !== undefined ? BigInt(index) : undefined;

        switch (kind) {
          case "create":
            return await send(escrow, escrowAbi, "createEscrow", [freelancer, amounts.map(BigInt)]);
          case "fund": {
            const need = BigInt(amount);
            const allowance = await readContract(config, { address: chain.usdc, abi: erc20Abi, functionName: "allowance", args: [account, escrow] });
            if (allowance < need) {
              setStep("Approve USDC in your wallet…");
              await send(chain.usdc, erc20Abi, "approve", [escrow, need]);
            }
            return await send(escrow, escrowAbi, "fund", [id, i]);
          }
          case "submit":
            return await send(escrow, escrowAbi, "submit", [id, i, keccak256(toHex(deliverableUrl))]);
          case "approve":
          case "claim":
          case "refund":
          case "dispute":
            return await send(escrow, escrowAbi, kind, [id, i]);
          case "resolve":
            return await send(escrow, escrowAbi, "resolve", [id, i, Math.round(freelancerPercent * 100)]);
          case "withdraw":
            return await send(escrow, escrowAbi, "withdraw", []);
          default:
            throw new Error(`Unknown action ${kind}`);
        }
      } finally {
        setStep("");
      }
    },
    [chain, config, ensureWallet, send],
  );

  return { onchain, step, enabled: !!chain };
}
