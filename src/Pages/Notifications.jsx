import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo } from "../lib/format";
import { refreshUnread } from "../lib/useUnread";
import { Button, CardSkeleton, EmptyState, PageHeader } from "../Components/ui";

export default function Notifications() {
  const { user, ready, openLogin } = useAuth();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!user) return;
    api("/api/notifications")
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  async function markAll() {
    await api("/api/notifications/read", { method: "POST", body: { all: true } }).catch(() => {});
    setItems((l) => l?.map((n) => ({ ...n, read: true })));
    refreshUnread();
  }

  if (ready && !user)
    return (
      <div className="container-page pt-12">
        <EmptyState as="h1" icon="bell" title="Log in to see your notifications" action={<Button onClick={openLogin}>Log in</Button>} />
      </div>
    );

  const unread = items?.filter((n) => !n.read).length || 0;
  return (
    <div className="container-page max-w-3xl pb-16">
      <PageHeader
       
        title="Notifications"
        subtitle="Everything that needs your attention on your jobs."
        action={
          unread > 0 && (
            <Button variant="secondary" size="sm" onClick={markAll}>
              Mark all read
            </Button>
          )
        }
      />
      {items === null && <CardSkeleton className="h-40" />}
      {items?.length === 0 && <EmptyState icon="bell" title="Nothing yet">Updates about applications, deliveries, payments and messages will show up here.</EmptyState>}
      <ul className="space-y-2">
        {items?.map((n) => (
          <li key={n.id}>
            <Link
              to={n.jobId ? `/jobs/${n.jobId}` : "/dashboard"}
              onClick={() => !n.read && api("/api/notifications/read", { method: "POST", body: { ids: [n.id] } }).then(refreshUnread)}
              className={`card block p-4 transition-colors hover:!border-gold/60 ${n.read ? "opacity-60" : ""}`}
            >
              <span className="flex items-start gap-3">
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="unread" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  {n.body && <span className="block text-sm text-ink-soft">{n.body}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted">{timeAgo(n.createdAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
