import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAuth } from "../context/useAuth";
import { shortAddr } from "../lib/format";
import { Button, Icon, IconButton } from "./ui";

const baseLinks = [
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium hover:bg-sage"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <IconButton
      icon="wallet"
      label={isPending ? "Connecting wallet" : "Connect wallet"}
      disabled={!connectors.length || isPending}
      onClick={() => connect({ connector: connectors[0] })}
    />
  );
}

const initials = (name = "") =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function NavigationBar() {
  const { user, ready, openLogin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const links = user ? [{ to: "/dashboard", label: "Dashboard" }, ...baseLinks] : baseLinks;

  const linkCls = ({ isActive }) =>
    `inline-flex min-h-11 items-center rounded-full px-5 text-[0.95rem] font-medium transition-colors ${
      isActive ? "bg-ink text-white" : "bg-sage text-ink-soft hover:bg-[#c3cec5]"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur">
      <nav className="container-page flex h-20 items-center justify-between gap-4" aria-label="Main">
        <Link to="/" className="font-serif text-[1.75rem] leading-none text-ink" aria-label="Blockchain Freelance home">
          Blockchain
        </Link>

        <ul className="hidden items-center gap-1.5 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={linkCls}>
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <WalletPill />
          {ready &&
            (user ? (
              <>
                <IconButton icon="logout" label="Log out" onClick={signOut} />
                <Link
                  to="/dashboard"
                  title={user.name}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-butter text-sm font-semibold ring-2 ring-white"
                >
                  {initials(user.name)}
                </Link>
              </>
            ) : (
              <Button onClick={openLogin}>Log in</Button>
            ))}
        </div>

        <IconButton
          icon={open ? "x" : "menu"}
          label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
          className="md:hidden"
        />
      </nav>

      {open && (
        <div id="mobile-menu" className="container-page pb-5 md:hidden">
          <div className="tile space-y-2 bg-white">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={(a) => `${linkCls(a)} w-full`} onClick={() => setOpen(false)}>
                {l.label}
              </NavLink>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <WalletPill />
              {user ? (
                <Button variant="secondary" size="sm" onClick={signOut}>
                  <Icon name="logout" size={16} /> Log out ({user.name})
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
        </div>
      )}
    </header>
  );
}
