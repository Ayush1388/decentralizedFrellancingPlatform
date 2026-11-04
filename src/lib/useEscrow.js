import { useCallback, useState } from "react";
import { useConfig } from "wagmi";
import { getAccount, getBalance, readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatUnits, keccak256, toHex } from "viem";
import escrowAbi from "../contracts/JobEscrow.abi.json";
import { erc20Abi } from "./abis";
import { useChainConfig } from "../context/useChainConfig";
import { useAuth } from "../context/useAuth";
import { TEST_CHAINS } from "./wagmi";
import { openWalletPicker } from "./walletModal";
import { shortAddr } from "./format";

// Turns wallet/viem errors into something a person can act on.
export function friendlyError(err) {
  const msg = err?.shortMessage || err?.message || String(err);
  if (err?.friendly) return msg;
  if (err?.name === "UserRejectedRequestError" || /user rejected|denied|rejected the request/i.test(msg)) return "You cancelled the request in your wallet.";
  if (/TooEarly/.test(msg)) return "It is too early for that. The waiting period has not ended yet.";
  if (/TooManyRevisions/.test(msg)) return "You have used all change requests for this milestone. Approve it, or open a dispute.";
  if (/UnexpectedTransferAmount/.test(msg)) return "The token did not transfer the full amount, so the funding was refused.";
  if (/BadStatus/.test(msg)) return "This milestone is not in the right state for that action. Use “Sync with blockchain” on the job page to refresh it.";
  if (/NotClient|NotFreelancer|NotParty|NotArbiter/.test(msg)) return "This wallet is not allowed to do that. Switch to the wallet linked to your account.";
  if (/insufficient funds/i.test(msg)) return "Your wallet does not have enough ETH to pay for network fees.";
  if (/exceeds balance|transfer amount exceeds/i.test(msg)) return "Your wallet does not have enough USDC for this.";
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

// An error whose message is already written for people, so friendlyError leaves it alone.
const plain = (message) => Object.assign(new Error(message), { friendly: true });

// Sends transactions to the JobEscrow contract from the user's wallet and waits for them to confirm.
// The caller then hands the returned hash to the API, which verifies it before updating anything.
export function useEscrow() {
  const config = useConfig();
  const chain = useChainConfig();
  const { user } = useAuth();
  const [step, setStep] = useState("");

  // Connects (asking which wallet), switches to the right network, and checks it is the wallet linked to the account.
  const ensureWallet = useCallback(async () => {
    if (!chain) throw plain("On-chain escrow is not enabled on this server.");
    if (!user?.walletAddress) throw plain("Link your wallet first: open the Box office page and press “Verify & link wallet”.");
    let acct = getAccount(config);
    if (!acct.isConnected) {
      setStep("Choose your wallet…");
      await openWalletPicker();
      acct = getAccount(config);
    }
    if (acct.chainId !== chain.chainId) {
      setStep("Switch network in your wallet…");
      await switchChain(config, { chainId: chain.chainId });
    }
    const address = getAccount(config).address;
    if (address.toLowerCase() !== user.walletAddress.toLowerCase()) {
      throw plain(`You are connected with ${shortAddr(address)}, but your account is linked to ${shortAddr(user.walletAddress)}. Switch to that account in your wallet, then try again.`);
    }
    return address;
  }, [config, chain, user?.walletAddress]);

  const send = useCallback(
    async (address, abi, functionName, args) => {
      setStep("Confirm in your wallet…");
      const hash = await writeContract(config, { address, abi, functionName, args });
      setStep("Waiting for the network to confirm…");
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw plain("The transaction failed on-chain.");
      return hash;
    },
    [config],
  );

  // kind: create | fund | submit | revise | approve | claim | refund | dispute | resolve | resolve-stale | withdraw
  const onchain = useCallback(
    async (kind, { escrowId, index, amount, approveAmount, freelancer, amounts, deliverableUrl, freelancerPercent } = {}) => {
      try {
        const account = await ensureWallet();
        const escrow = chain.escrow;
        const id = escrowId !== undefined ? BigInt(escrowId) : undefined;
        const i = index !== undefined ? BigInt(index) : undefined;

        // Without ETH nothing can be sent: say so before the wallet fails with a cryptic message.
        const eth = await getBalance(config, { address: account });
        if (eth.value === 0n) {
          throw plain(
            TEST_CHAINS.includes(chain.chainId)
              ? "Your wallet has no test ETH for network fees. Get some free from a Sepolia faucet, then try again."
              : "Your wallet has no ETH for network fees. Add a little ETH, then try again.",
          );
        }

        switch (kind) {
          case "create":
            return await send(escrow, escrowAbi, "createEscrow", [freelancer, amounts.map(BigInt)]);
          case "fund": {
            const need = BigInt(amount);
            const balance = await readContract(config, { address: chain.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] });
            if (balance < need) {
              throw plain(
                `You have ${formatUnits(balance, 6)} USDC and this needs ${formatUnits(need, 6)}.${
                  TEST_CHAINS.includes(chain.chainId) ? " Get free test USDC at faucet.circle.com, then try again." : ""
                }`,
              );
            }
            // Approve once for everything still to fund on this job, so later milestones need one confirmation, not two.
            const allowance = await readContract(config, { address: chain.usdc, abi: erc20Abi, functionName: "allowance", args: [account, escrow] });
            if (allowance < need) {
              setStep("Approve USDC in your wallet…");
              const top = approveAmount ? BigInt(approveAmount) : need;
              await send(chain.usdc, erc20Abi, "approve", [escrow, top > need ? top : need]);
            }
            return await send(escrow, escrowAbi, "fund", [id, i]);
          }
          case "submit":
            return await send(escrow, escrowAbi, "submit", [id, i, keccak256(toHex(deliverableUrl))]);
          case "revise":
            return await send(escrow, escrowAbi, "requestChanges", [id, i]);
          case "approve":
          case "claim":
          case "refund":
          case "dispute":
            return await send(escrow, escrowAbi, kind, [id, i]);
          case "resolve":
            return await send(escrow, escrowAbi, "resolve", [id, i, Math.round(freelancerPercent * 100)]);
          case "resolve-stale":
            return await send(escrow, escrowAbi, "resolveStale", [id, i]);
          case "withdraw":
            return await send(escrow, escrowAbi, "withdraw", []);
          default:
            throw plain(`Unknown action ${kind}`);
        }
      } finally {
        setStep("");
      }
    },
    [chain, config, ensureWallet, send],
  );

  return { onchain, step, enabled: !!chain };
}
