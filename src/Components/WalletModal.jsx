import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { closeWalletPicker, useWalletPickerOpen } from "../lib/walletModal";
import { ErrorNote, Icon } from "./ui";

// Lists every wallet the visitor can use: the ones installed in this browser, Coinbase Wallet, and WalletConnect for phones.
export default function WalletModal() {
  const open = useWalletPickerOpen();
  const ref = useRef(null);
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // The generic "Injected" entry is dropped when a named browser wallet was detected.
  const named = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const hasBrowserWallet = named.length > 0 || (typeof window !== "undefined" && !!window.ethereum);
  // The generic entry only makes sense when a browser wallet exists but did not announce itself by name.
  const list = connectors.filter((c) => (c.id === "injected" ? named.length === 0 && hasBrowserWallet : true));

  async function pick(connector) {
    setError("");
    try {
      const res = await connectAsync({ connector });
      closeWalletPicker(res.accounts[0]);
    } catch (err) {
      const rejected = err?.name === "UserRejectedRequestError" || /rejected|denied|closed/i.test(err?.message || "");
      setError(rejected ? "The connection was cancelled in your wallet." : err.shortMessage || err.message);
    }
  }

  const hint = (c) =>
    c.id === "coinbaseWalletSDK" ? "App or browser extension" : c.id === "walletConnect" ? "Scan a QR code with a phone wallet" : c.type === "injected" ? "Detected in this browser" : "";

  return (
    <dialog
      ref={ref}
      onClose={() => closeWalletPicker(null)}
      onClick={(e) => e.target === ref.current && closeWalletPicker(null)}
      aria-labelledby="wallet-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_32px_80px_-20px_rgb(0_0_0/0.85)] backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-6 sm:p-8">
        <button type="button" onClick={() => closeWalletPicker(null)} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center text-muted hover:text-gold">
          <Icon name="x" size={20} />
        </button>
        <h2 id="wallet-title" className="text-2xl font-semibold">
          Connect a wallet
        </h2>
        <p className="mt-2 text-sm text-muted">Pick the wallet you use. Connecting never moves money: you approve every transaction yourself.</p>

        <ul className="mt-5 space-y-2">
          {list.map((c) => (
            <li key={c.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(c)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-[#3d3332] px-4 text-left transition-colors hover:border-gold disabled:opacity-60"
              >
                {c.icon ? <img src={c.icon} alt="" width="28" height="28" className="h-7 w-7 rounded-[4px]" /> : <Icon name="wallet" size={24} className="text-gold" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted">{hint(c)}</span>
                </span>
                {isPending && variables?.connector?.uid === c.uid && <span className="text-xs text-gold">Check your wallet…</span>}
              </button>
            </li>
          ))}
        </ul>

        {!hasBrowserWallet && (
          <p className="mt-4 rounded-lg border border-dashed border-[#3d3332] px-3 py-2 text-sm text-ink-soft">
            No browser wallet found.{" "}
            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-gold underline-offset-2 hover:underline">
              Install MetaMask
            </a>{" "}
            or use Coinbase Wallet.
          </p>
        )}
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </dialog>
  );
}
