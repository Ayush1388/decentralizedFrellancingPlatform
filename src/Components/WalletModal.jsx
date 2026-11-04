import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { closeWalletPicker, useWalletPickerOpen } from "../lib/walletModal";
import { ErrorNote, Icon } from "./ui";

// Popular browser wallets, offered with an install link when they are not in this browser.
const popular = [
  { name: "MetaMask", match: "metamask", url: "https://metamask.io/download/" },
  { name: "Phantom", match: "phantom", url: "https://phantom.com/download" },
  { name: "Rabby", match: "rabby", url: "https://rabby.io/" },
];

// Lists every wallet the visitor can use: the ones installed in this browser (each once, by name), Coinbase Wallet,
// and WalletConnect for phones.
export default function WalletModal() {
  const open = useWalletPickerOpen();
  const ref = useRef(null);
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const [error, setError] = useState("");
  const tried = useRef(false);

  const w = typeof window !== "undefined" ? window : {};
  // Wallets that announced themselves (EIP-6963) carry their own name and icon.
  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected" && c.id !== "phantom");
  const names = announced.map((c) => c.name.toLowerCase());
  const has = (word) => names.some((n) => n.includes(word));
  // Phantom versions that do not announce themselves are still found through window.phantom.ethereum.
  const phantomOnly = !!w.phantom?.ethereum && !has("phantom");
  // The generic entry is only for a browser wallet that neither announced itself nor is Phantom.
  const plainInjected = !!w.ethereum && announced.length === 0 && !(phantomOnly && w.ethereum?.isPhantom);
  const installed = (c) => c.type === "injected";
  const list = connectors
    .filter((c) => (c.id === "phantom" ? phantomOnly : c.id === "injected" ? plainInjected : true))
    .sort((a, b) => Number(installed(b)) - Number(installed(a)));
  const hasBrowserWallet = announced.length > 0 || phantomOnly || plainInjected;
  const browserWallets = list.filter(installed);
  const others = list.filter((c) => !installed(c));
  const missing = popular.filter((p) => !has(p.match) && !(p.match === "phantom" && phantomOnly) && !(p.match === "metamask" && w.ethereum?.isMetaMask));

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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError("");
      d.showModal();
      // One wallet in this browser: open it straight away, the way a single extension expects. The list stays
      // underneath in case the person cancels or wants another way to connect.
      if (browserWallets.length === 1 && !tried.current) {
        tried.current = true;
        pick(browserWallets[0]);
      }
    }
    if (!open && d.open) d.close();
    if (!open) tried.current = false;
    // pick and the wallet list are read at the moment the picker opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hint = (c) =>
    c.id === "coinbaseWalletSDK"
      ? "App or browser extension"
      : c.id === "walletConnect"
        ? "Scan a QR code with a phone wallet"
        : /phantom/i.test(c.name)
          ? "Installed. Uses your Phantom Ethereum account"
          : c.type === "injected"
            ? "Installed in this browser"
            : "";

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

        {browserWallets.length > 0 && (
          <>
            <p className="mt-5 text-sm font-medium text-ink-soft">Installed in this browser</p>
            <ul className="mt-2 space-y-2">
              {browserWallets.map((c) => (
                  <li key={c.uid}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => pick(c)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 text-left transition-colors hover:border-gold disabled:opacity-60 ${isPending && variables?.connector?.uid === c.uid ? "border-gold bg-gold/[0.06]" : "border-[#3d3332]"}`}
                    >
                      {c.icon ? <img src={c.icon} alt="" width="28" height="28" className="h-7 w-7 rounded-[4px]" /> : <Icon name="wallet" size={24} className="text-gold" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{c.name}</span>
                        <span className="block text-xs text-muted">{hint(c)}</span>
                      </span>
                      {isPending && variables?.connector?.uid === c.uid && <span className="text-xs text-gold">Approve in {c.name}…</span>}
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
        <p className="mt-5 text-sm font-medium text-ink-soft">{browserWallets.length > 0 ? "Other ways to connect" : "Ways to connect"}</p>
        <ul className="mt-2 space-y-2">
          {others.map((c) => (
            <li key={c.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(c)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 text-left transition-colors hover:border-gold disabled:opacity-60 ${isPending && variables?.connector?.uid === c.uid ? "border-gold bg-gold/[0.06]" : "border-[#3d3332]"}`}
              >
                {c.icon ? <img src={c.icon} alt="" width="28" height="28" className="h-7 w-7 rounded-[4px]" /> : <Icon name="wallet" size={24} className="text-gold" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted">{hint(c)}</span>
                </span>
                {isPending && variables?.connector?.uid === c.uid && <span className="text-xs text-gold">Approve in {c.name}…</span>}
              </button>
            </li>
          ))}
        </ul>

        {!hasBrowserWallet && <p className="mt-4 text-sm text-ink-soft">No wallet found in this browser. Install one below, or use Coinbase Wallet.</p>}
        {missing.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-muted">{hasBrowserWallet ? "Use another wallet?" : "Get a wallet"}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {missing.map((p) => (
                <li key={p.name}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3d3332] px-3 text-sm font-medium text-ink-soft hover:border-[#6a5a55] hover:text-ink"
                  >
                    Install {p.name}
                    <Icon name="arrowUpRight" size={14} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">After installing, reload this page and it will show up above.</p>
          </div>
        )}
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </dialog>
  );
}
