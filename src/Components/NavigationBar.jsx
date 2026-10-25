import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAuth } from "../context/useAuth";
import { shortAddr } from "../lib/format";
import { Icon, IconButton } from "./ui";

// Theatre names first, plain names underneath so nobody has to guess.
const baseLinks = [
  { to: "/jobs", label: "Programme", hint: "Jobs" },
  { to: "/developers", label: "The cast", hint: "Developers" },
  { to: "/wallet", label: "Box office", hint: "Wallet" },
];

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect wallet"
        className="inline-flex min-h-10 items-center gap-2 border border-[#3a3733] px-3 font-mono text-xs hover:border-gold hover:text-gold"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <IconButton
      icon="wallet"
      size={40}
      label={isPending ? "Connecting wallet" : "Connect wallet"}
      disabled={!connectors.length || isPending}
      onClick={() => connect({ connector: connectors[0] })}
    />
  );
}

export default function NavigationBar() {
  const { user, ready, openLogin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const links = user ? [...baseLinks, { to: "/dashboard", label: "My seat", hint: "Dashboard" }] : baseLinks;

  const linkCls = ({ isActive }) =>
    `group flex flex-col items-center px-1 py-1 transition-colors ${isActive ? "text-gold" : "text-ink-soft hover:text-gold"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-paper/90 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-4" aria-label="Main">
        <Link to="/" className="flex items-center gap-2 text-gold" aria-label="Blockchain Picture House, home">
          <Icon name="shield" size={18} />
          <span className="eyebrow !tracking-[0.26em]">
            Blockchain<span className="hidden sm:inline"> Picture House</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={linkCls}>
                <span className="eyebrow">{l.label}</span>
                <span className="font-mono text-[0.62rem] text-muted group-hover:text-gold/80">{l.hint}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <WalletButton />
          {ready &&
            (user ? (
              <>
                <span className="max-w-32 truncate font-mono text-xs text-muted" title={user.name}>
                  {user.name}
                </span>
                <IconButton icon="logout" size={40} label="Log out" onClick={signOut} />
              </>
            ) : (
              <button onClick={openLogin} className="eyebrow inline-flex min-h-10 items-center bg-gold px-4 text-poster hover:brightness-110">
                Log in
              </button>
            ))}
        </div>

        <IconButton
          icon={open ? "x" : "menu"}
          size={40}
          label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
          className="md:hidden"
        />
      </nav>

      {open && (
        <div id="mobile-menu" className="container-page border-t border-white/5 pb-5 md:hidden">
          <ul className="divide-y divide-white/5">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-baseline justify-between py-3.5 ${isActive ? "text-gold" : "text-ink"}`}
                >
                  <span className="poster-title text-3xl">{l.label}</span>
                  <span className="font-mono text-xs text-muted">{l.hint}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <WalletButton />
            {user ? (
              <button onClick={signOut} className="eyebrow inline-flex min-h-10 items-center gap-2 border border-[#3a3733] px-4">
                <Icon name="logout" size={14} /> Log out ({user.name})
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  openLogin();
                }}
                className="eyebrow inline-flex min-h-10 items-center bg-gold px-4 text-poster"
              >
                Log in
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
