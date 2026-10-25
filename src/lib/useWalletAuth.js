import { useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { api } from "./api";
import { useAuth } from "../context/useAuth";

// Sign-In with Ethereum: fetch a one-time message, have the wallet sign it
// (no gas, no transaction), and let the server verify it. If the visitor is
// already logged in the wallet gets linked to their account instead.
export function useWalletAuth() {
  const { signIn } = useAuth();
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      let addr = address;
      if (!isConnected) {
        if (!connectors.length) throw new Error("No browser wallet found. Install MetaMask to continue.");
        const res = await connectAsync({ connector: connectors[0] });
        addr = res.accounts[0];
      }
      const { message } = await api(`/api/auth/wallet/nonce?address=${addr}`);
      const signature = await signMessageAsync({ message });
      const session = await api("/api/auth/wallet/verify", { method: "POST", body: { address: addr, signature } });
      signIn(session);
      return session;
    } catch (err) {
      const rejected = err?.name === "UserRejectedRequestError" || /rejected/i.test(err?.message || "");
      setError(rejected ? "You cancelled the request in your wallet." : err.shortMessage || err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error };
}
