import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAuth } from "../context/useAuth";
import { shortAddr } from "../lib/format";
import { Button, Icon } from "./ui";

const links = [
  { to: "/developers", label: "Developers" },
  { to: "/jobs", label: "Jobs" },
  { to: "/wallet", label: "Wallet" },
];

function WalletPill() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect wallet"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-green-700"
      >
        <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden="true" />
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <Button variant="secondary" size="sm" loading={isPending} disabled={!connectors.length} onClick={() => connect({ connector: connectors[0] })}>
      <Icon name="wallet" size={16} /> Connect wallet
    </Button>
  );
}

export default function NavigationBar() {
  const { user, ready, openLogin, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const linkCls = ({ isActive }) =>
    `rounded-full px-4 py-2 text-[0.95rem] font-medium transition-colors ${
      isActive ? "bg-green-50 text-green-800" : "text-ink-soft hover:text-green-800"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-4" aria-label="Main">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-green-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-700 text-white">
            <Icon name="shield" size={18} />
          </span>
          Blockchain
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={linkCls}>
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <WalletPill />
          {ready &&
            (user ? (
              <>
                <Link to="/wallet" className="max-w-32 truncate text-sm font-medium" title={user.name}>
                  {user.name}
                </Link>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  Log out
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={openLogin}>
                Log in
              </Button>
            ))}
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "x" : "menu"} />
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="container-page space-y-1 border-t border-line pb-5 pt-3 md:hidden">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls} onClick={() => setOpen(false)}>
              <span className="block py-1">{l.label}</span>
            </NavLink>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <WalletPill />
            {user ? (
              <Button variant="ghost" size="sm" onClick={signOut}>
                Log out ({user.name})
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  openLogin();
                }}
              >
                Log in
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
