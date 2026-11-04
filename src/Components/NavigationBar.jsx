import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAccount, useDisconnect } from "wagmi";
import { useAuth } from "../context/useAuth";
import { shortAddr } from "../lib/format";
import { openWalletPicker } from "../lib/walletModal";
import { useUnread } from "../lib/useUnread";
import { Icon, IconButton } from "./ui";
import NotificationBell from "./NotificationBell";

// Theatre names first, plain names underneath so nobody has to guess.
const baseLinks = [
  { to: "/jobs", label: "Programme", hint: "Jobs" },
  { to: "/developers", label: "The cast", hint: "Developers" },
  { to: "/wallet", label: "Box office", hint: "Wallet" },
];

function WalletButton() {
  const { address, isConnected } = useAccount();
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
        className="flex h-10 w-10 items-center justify-center border border-gold bg-gold/10 font-mono text-xs font-bold text-gold hover:bg-gold/20"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 border border-gold/40 bg-surface py-1 shadow-2xl">
          <p className="truncate border-b border-white/10 px-4 py-3 text-sm font-semibold">{user.name}</p>
          <button role="menuitem" className={item} onClick={() => go("/dashboard")}>
            <Icon name="grid" size={16} className="text-gold" /> My seat
          </button>
          <button role="menuitem" className={item} onClick={() => go("/jobs?tab=saved")}>
            <Icon name="bookmark" size={16} className="text-gold" /> Saved jobs
          </button>
          <button role="menuitem" className={item} onClick={() => go("/jobs/new")}>
            <Icon name="plus" size={16} className="text-gold" /> Post a job
          </button>
          {user.isAdmin && (
            <button role="menuitem" className={item} onClick={() => go("/admin")}>
              <Icon name="shield" size={16} className="text-gold" /> Admin
            </button>
          )}
          <button role="menuitem" className={item} onClick={() => go("/settings")}>
            <Icon name="sliders" size={16} className="text-gold" /> Settings
          </button>
          <button role="menuitem" className={item} onClick={() => go("/help")}>
            <Icon name="chat" size={16} className="text-gold" /> Help
          </button>
          <button
            role="menuitem"
            className={`${item} border-t border-white/10`}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <Icon name="logout" size={16} className="text-gold" /> Log out
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
  const links = user ? [...baseLinks, { to: "/dashboard", label: "My seat", hint: "Dashboard", dot: unread.messages > 0 }] : baseLinks;

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
                <span className="eyebrow relative">
                  {l.label}
                  {l.dot && <span className="absolute -right-2.5 -top-1 h-2 w-2 rounded-full bg-marker" title="Unread messages" />}
                </span>
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
                <NotificationBell />
                <AccountMenu user={user} onSignOut={signOut} />
              </>
            ) : (
              <button onClick={openLogin} className="eyebrow inline-flex min-h-10 items-center bg-gold px-4 text-poster hover:brightness-110">
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
                <NavLink to={l.to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-baseline justify-between py-3.5 ${isActive ? "text-gold" : "text-ink"}`}>
                  <span className="poster-title text-3xl">
                    {l.label}
                    {l.dot && <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-marker align-middle" />}
                  </span>
                  <span className="font-mono text-xs text-muted">{l.hint}</span>
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
                className="eyebrow inline-flex min-h-10 items-center gap-2 border border-[#3a3733] px-4"
              >
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
