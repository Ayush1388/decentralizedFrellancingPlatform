import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAccount, useDisconnect } from "wagmi";
import { useAuth } from "../context/useAuth";
import { shortAddr } from "../lib/format";
import { openWalletPicker } from "../lib/walletModal";
import { useUnread } from "../lib/useUnread";
import { Icon, IconButton } from "./ui";
import NotificationBell from "./NotificationBell";

// Plain names: the theatre lives in the look, not in words people have to decode.
const baseLinks = [
  { to: "/jobs", label: "Jobs" },
  { to: "/developers", label: "Developers" },
  { to: "/wallet", label: "Wallet" },
];

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect wallet"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3d3332] px-3 font-mono text-xs text-ink-soft hover:border-[#6a5a55] hover:text-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
        {shortAddr(address)}
      </button>
    );
  }
  return <IconButton icon="wallet" size={40} label="Connect wallet" onClick={() => openWalletPicker().catch(() => {})} />;
}

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// The signed-in person's menu: where their own things live.
function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5";
  const go = (to) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-sm font-semibold text-poster hover:brightness-110"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.7)]">
          <p className="truncate border-b border-line px-4 py-3 text-sm font-semibold">{user.name}</p>
          <button role="menuitem" className={item} onClick={() => go("/dashboard")}>
            <Icon name="grid" size={16} className="text-muted" /> Dashboard
          </button>
          <button role="menuitem" className={item} onClick={() => go("/jobs?tab=saved")}>
            <Icon name="bookmark" size={16} className="text-muted" /> Saved jobs
          </button>
          <button role="menuitem" className={item} onClick={() => go("/jobs/new")}>
            <Icon name="plus" size={16} className="text-muted" /> Post a job
          </button>
          {user.isAdmin && (
            <button role="menuitem" className={item} onClick={() => go("/admin")}>
              <Icon name="shield" size={16} className="text-muted" /> Admin
            </button>
          )}
          <button role="menuitem" className={item} onClick={() => go("/settings")}>
            <Icon name="sliders" size={16} className="text-muted" /> Settings
          </button>
          <button role="menuitem" className={item} onClick={() => go("/help")}>
            <Icon name="chat" size={16} className="text-muted" /> Help
          </button>
          <button
            role="menuitem"
            className={`${item} border-t border-line`}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <Icon name="logout" size={16} className="text-muted" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavigationBar() {
  const { user, ready, openLogin, signOut } = useAuth();
  const unread = useUnread();
  const [open, setOpen] = useState(false);
  const links = user ? [...baseLinks, { to: "/dashboard", label: "Dashboard", dot: unread.messages > 0 }] : baseLinks;

  // The current page gets a gold rule under its name, like the lit sign over the screen that is showing.
  const linkCls = ({ isActive }) =>
    `relative flex h-16 items-center text-[0.9375rem] font-medium transition-colors ${isActive ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-gold" : "text-ink-soft hover:text-ink"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-paper/90 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-4" aria-label="Main">
        <Link to="/" className="flex min-h-11 items-center gap-2.5" aria-label="Blockchain Picture House, home">
          <img src="/favicon.svg" alt="" width="26" height="26" />
          <span className="poster-title text-xl tracking-wide text-ink">
            <span className="hidden sm:inline">Blockchain </span>Picture House
          </span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={linkCls}>
                {l.label}
                {l.dot && (
                  <span className="ml-1.5 h-2 w-2 rounded-full bg-marker" title="Unread messages">
                    <span className="sr-only">, unread messages</span>
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <WalletButton />
          {ready &&
            (user ? (
              <>
                <NotificationBell />
                <AccountMenu user={user} onSignOut={signOut} />
              </>
            ) : (
              <button onClick={openLogin} className="inline-flex min-h-10 items-center rounded-lg bg-gold px-4 text-[0.9375rem] font-semibold text-poster hover:brightness-110">
                Log in
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {user && <NotificationBell />}
          <IconButton icon={open ? "x" : "menu"} size={40} label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)} />
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="container-page border-t border-white/5 pb-5 md:hidden">
          <ul className="divide-y divide-white/5">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center justify-between py-3.5 text-lg font-medium ${isActive ? "text-gold" : "text-ink"}`}>
                  <span>
                    {l.label}
                    {l.dot && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-marker align-middle" aria-label="unread messages" />}
                  </span>
                </NavLink>
              </li>
            ))}
            {user && (
              <>
                {[
                  ["/jobs/new", "Post a job"],
                  ["/jobs?tab=saved", "Saved jobs"],
                  ["/settings", "Settings"],
                  ["/help", "Help"],
                  ...(user.isAdmin ? [["/admin", "Admin"]] : []),
                ].map(([to, label]) => (
                  <li key={to}>
                    <NavLink to={to} onClick={() => setOpen(false)} className="block py-3 text-ink-soft">
                      {label}
                    </NavLink>
                  </li>
                ))}
              </>
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <WalletButton />
            {user ? (
              <button
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3d3332] px-4 text-[0.9375rem] font-medium"
              >
                <Icon name="logout" size={16} /> Log out
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  openLogin();
                }}
                className="inline-flex min-h-10 items-center rounded-lg bg-gold px-4 text-[0.9375rem] font-semibold text-poster"
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
