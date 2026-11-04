import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { refreshUnread, useUnread } from "../lib/useUnread";
import { Icon } from "./ui";

// The bell in the top bar: a count of unread notifications and a panel with the latest ones.
export default function NotificationBell() {
  const unread = useUnread();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    api("/api/notifications")
      .then(setItems)
      .catch(() => setItems([]));
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function markAll() {
    await api("/api/notifications/read", { method: "POST", body: { all: true } }).catch(() => {});
    setItems((list) => list?.map((n) => ({ ...n, read: true })));
    refreshUnread();
  }

  async function go(n) {
    setOpen(false);
    if (!n.read) {
      await api("/api/notifications/read", { method: "POST", body: { ids: [n.id] } }).catch(() => {});
      refreshUnread();
    }
    navigate(n.jobId ? `/jobs/${n.jobId}` : "/dashboard");
  }

  const count = unread.notifications;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#3d3332] text-ink-soft hover:border-[#6a5a55] hover:text-ink"
      >
        <Icon name="bell" size={18} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-marker px-1 text-xs font-semibold tabular-nums text-poster">{count > 9 ? "9+" : count}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_48px_-12px_rgb(0_0_0/0.7)]" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {count > 0 && (
              <button onClick={markAll} className="min-h-8 text-sm text-muted hover:text-ink">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-center text-sm text-muted">Loading…</li>}
            {items?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet. Updates about your jobs show up here.</li>}
            {items?.slice(0, 12).map((n) => (
              <li key={n.id}>
                <button onClick={() => go(n)} className={`block w-full border-b border-line px-4 py-3 text-left hover:bg-white/5 ${n.read ? "opacity-60" : ""}`}>
                  <span className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-xs text-ink-soft">{n.body}</span>}
                      <span className="block tabular-nums text-xs text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm font-medium text-gold hover:bg-white/5">
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
