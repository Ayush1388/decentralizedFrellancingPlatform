import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo } from "../lib/format";
import { Badge, Button, EmptyState, ErrorNote, PageHeader } from "../Components/ui";

function Reports() {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api(`/api/admin/reports${all ? "?status=all" : ""}`).then(setList).catch((e) => setError(e.message)), [all]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(path, body) {
    setError("");
    try {
      await api(path, { method: "POST", body });
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  const resolve = (r, note) => act(`/api/admin/reports/${r.id}/resolve`, { note });

  return (
    <section aria-label="Reports" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="poster-title text-3xl text-gold">Reports</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[#f2c230]" /> Include resolved
        </label>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {list?.length === 0 && <p className="border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted">No reports to review.</p>}
      <ul className="space-y-3">
        {list?.map((r) => (
          <li key={r.id} className={`card space-y-3 p-4 ${r.resolved ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                <Badge tone="amber">{r.kind}</Badge>{" "}
                {r.kind === "job" ? (
                  <Link to={`/jobs/${r.targetId}`} className="text-gold underline-offset-2 hover:underline">
                    {r.targetName || `#${r.targetId}`}
                  </Link>
                ) : (
                  <span>{r.targetName || `#${r.targetId}`}</span>
                )}
              </p>
              <span className="font-mono text-xs text-muted">
                by {r.reporter} · {timeAgo(r.createdAt)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-soft">“{r.reason}”</p>
            {r.resolved ? (
              <p className="text-xs text-muted">Resolved{r.note ? `: ${r.note}` : ""}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {r.kind === "job" && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await act(`/api/admin/jobs/${r.targetId}/remove`);
                      resolve(r, "Posting removed");
                    }}
                  >
                    Remove the posting
                  </Button>
                )}
                {r.kind === "user" && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await act(`/api/admin/users/${r.targetId}/ban`, { banned: true, reason: r.reason });
                      resolve(r, "Account suspended");
                    }}
                  >
                    Suspend the account
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => resolve(r, "No action needed")}>
                  Dismiss
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Users() {
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setList).catch((e) => setError(e.message)), [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function ban(u, banned) {
    setError("");
    try {
      await api(`/api/admin/users/${u.id}/ban`, { method: "POST", body: { banned, reason: banned ? window.prompt?.("Reason for the suspension?") || "" : "" } });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section aria-label="Users" className="space-y-4">
      <h2 className="poster-title text-3xl text-gold">People</h2>
      <label htmlFor="admin-user-search" className="sr-only">
        Search people
      </label>
      <input id="admin-user-search" className="input" placeholder="Search by name, email or wallet" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      <ul className="space-y-2">
        {list?.map((u) => (
          <li key={u.id} className="card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {u.name} {u.demo && <Badge tone="red">Demo</Badge>} {u.banned && <Badge tone="red">Suspended</Badge>}
              </p>
              <p className="truncate font-mono text-xs text-muted">
                {u.email || "no email"} · {u.wallet ? `${u.wallet.slice(0, 8)}…` : "no wallet"} · {u.jobs} job{u.jobs === 1 ? "" : "s"} · joined {timeAgo(u.createdAt)}
              </p>
              {u.banned && u.banReason && <p className="text-xs text-red-700">Reason: {u.banReason}</p>}
            </div>
            {!u.demo &&
              (u.banned ? (
                <Button size="sm" variant="secondary" onClick={() => ban(u, false)}>
                  Restore
                </Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => ban(u, true)}>
                  Suspend
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

// /admin  Reports, people, and a link to the dispute queue. Only for accounts listed in ADMIN_EMAILS.
export default function Admin() {
  const { user, ready, openLogin } = useAuth();
  const [tab, setTab] = useState("reports");
  if (!ready) return <div className="container-page pt-12" aria-busy="true" />;
  if (!user)
    return (
      <div className="container-page pt-12">
        <EmptyState icon="lock" title="Log in" action={<Button onClick={openLogin}>Log in</Button>} />
      </div>
    );
  if (!user.isAdmin)
    return (
      <div className="container-page pt-12">
        <EmptyState icon="lock" title="Platform team only" action={<Button to="/">Go home</Button>}>
          This page is for the people who run the platform.
        </EmptyState>
      </div>
    );
  return (
    <div className="container-page max-w-4xl space-y-6 pb-16">
      <PageHeader eyebrow="Backstage" title="Admin" subtitle="Reports, people and disputes." action={<Button to="/dashboard" variant="secondary" size="sm">Open the dispute queue</Button>} />
      <div role="tablist" aria-label="Admin sections" className="flex gap-2">
        {[
          ["reports", "Reports"],
          ["users", "People"],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`eyebrow min-h-11 px-5 ${tab === id ? "bg-gold text-poster" : "border border-[#3a3733] hover:border-gold hover:text-gold"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "reports" ? <Reports /> : <Users />}
    </div>
  );
}
