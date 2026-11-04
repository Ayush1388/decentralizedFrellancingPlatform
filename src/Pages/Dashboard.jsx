import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { appStatus, jobStatus } from "../lib/jobStatus";
import { timeAgo, usdc } from "../lib/format";
import { useEmailSetting } from "../lib/useEmailSetting";
import { useChainConfig } from "../context/useChainConfig";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, IconButton } from "../Components/ui";

const groups = [
  { key: "pending", label: "Not funded" },
  { key: "escrow", label: "In escrow" },
  { key: "paid", label: "Paid out" },
  { key: "refunded", label: "Refunded" },
];

const filters = [
  { id: "all", label: "All" },
  { id: "client", label: "As client" },
  { id: "freelancer", label: "As freelancer" },
  { id: "applicant", label: "My applications" },
];

const compact = (units) => usdc(units, { compact: true });

function TileHead({ title, children }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="poster-title text-3xl">{title}</h2>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

// First steps for a new account: only what is still undone, and only what matters on this site.
function GetStarted({ user, jobs }) {
  const chain = useChainConfig();
  const email = useEmailSetting();
  const steps = [
    chain && !user.walletAddress && { to: "/wallet", title: "Link your wallet", text: "You need one to be hired, to fund work and to withdraw." },
    user.email && !user.emailVerified && email.available && { to: "/settings", title: "Confirm your email", text: "Required to post jobs and apply." },
    !user.email && { to: "/settings", title: "Add an email", text: "Get notifications and be able to recover your account." },
    jobs.length === 0 && { to: "/jobs", title: "Find a job or post one", text: "Browse the programme, or describe the work you need done." },
  ].filter(Boolean);
  if (!steps.length) return null;
  return (
    <section className="tile mb-4 !border-gold/40" aria-label="Get started">
      <TileHead title="Get started" />
      <ul className="grid gap-2 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title}>
            <Link to={s.to} className="block h-full bg-black/30 p-4 transition-colors hover:bg-black/50">
              <span className="font-semibold">{s.title}</span>
              <span className="mt-1 block text-sm text-ink-soft">{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  const { user, ready, openLogin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [disputes, setDisputes] = useState(null);

  useEffect(() => {
    if (!user) return;
    const ctl = new AbortController();
    api("/api/dashboard", { signal: ctl.signal })
      .then(setData)
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [user]);

  // The arbiter's queue: every frozen milestone waiting for a ruling.
  useEffect(() => {
    if (!user?.isAdmin) return;
    api("/api/admin/disputes")
      .then(setDisputes)
      .catch(() => setDisputes([]));
  }, [user]);

  if (ready && !user) {
    return (
      <div className="container-page pt-10">
        <EmptyState image="/Work time-rafiki.svg" title="Log in to see your dashboard" action={<Button onClick={openLogin}>Log in</Button>}>
          Your jobs, milestones and payments in one place.
        </EmptyState>
      </div>
    );
  }

  const jobs = (data?.jobs || []).filter((j) => filter === "all" || j.role === filter);
  const sums = data?.sums || {};
  const actions = (data?.actions || []).filter((a) => filter === "all" || (data?.jobs || []).find((j) => j.id === a.jobId)?.role === filter);
  const total = groups.reduce((t, g) => t + (sums[g.key]?.amount || 0), 0);
  const maxGroup = Math.max(1, ...groups.map((g) => sums[g.key]?.amount || 0));
  const contracts = jobs.filter((j) => j.role !== "applicant" && j.total > 0 && ["in_progress", "completed"].includes(j.status));
  const talking = jobs.filter((j) => j.status === "in_progress" && j.counterpart && j.role !== "applicant");

  return (
    <div className="container-page pb-4 pt-4">
      {/* Overview row */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-1 md:grid-cols-4">
        <div>
          <p className="stat-label">Overview</p>
          <p className="stat-value mt-1 truncate">{user?.name}</p>
        </div>
        <div>
          <p className="stat-label">Jobs</p>
          <p className="stat-value mt-1">{data ? `${jobs.length} total` : "—"}</p>
        </div>
        <div>
          <p className="stat-label">In escrow</p>
          <p className="stat-value mt-1">{data ? usdc(sums.escrow?.amount || 0) : "—"}</p>
        </div>
        <div>
          <p className="stat-label">Paid out</p>
          <p className="stat-value mt-1">{data ? usdc(sums.paid?.amount || 0) : "—"}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter by role" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`eyebrow inline-flex min-h-11 items-center px-5 transition-colors ${filter === f.id ? "bg-gold text-poster" : "border border-[#3a3733] hover:border-gold hover:text-gold"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <IconButton icon="plus" label="Post a job" to="/jobs/new" tone="sage" />
          <IconButton icon="wallet" label="Wallet" to="/wallet" tone="sage" />
          <IconButton icon="sliders" label="Settings" to="/settings" tone="sage" />
        </div>
      </div>

      <div className="mt-6">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {!data && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} className="h-72" />
          ))}
        </div>
      ) : (
        data && (
          <>
            <GetStarted user={user} jobs={data.jobs} />
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Milestones by state, hatched bars */}
              <section className="tile flex flex-col" aria-label="Milestones">
                <TileHead title={`Milestones (${groups.reduce((t, g) => t + (sums[g.key]?.count || 0), 0)})`}>
                  <IconButton icon="arrowUpRight" label="All jobs" to="/jobs?tab=mine" tone="sage" size={38} />
                </TileHead>
                <div className="mt-auto flex h-48 items-end gap-3">
                  {groups.map((g) => {
                    const amount = sums[g.key]?.amount || 0;
                    return (
                      <div key={g.key} className="flex h-full flex-1 flex-col justify-end">
                        <p className="text-xs text-muted">{g.label}</p>
                        <p className="mb-1.5 text-sm font-semibold">{compact(amount)}</p>
                        <div className="hatch bg-sage" style={{ height: `${Math.max(6, (amount / maxGroup) * 100)}%` }} />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Payments per contract */}
              <section className="tile !border-gold/40 bg-[#0f0e0d]" aria-label="Payments">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="poster-title text-3xl">Payments</h2>
                  <div className="text-right">
                    <p className="text-xl font-semibold">{usdc(total)}</p>
                    <p className="text-xs text-gold">{total ? Math.round(((sums.paid?.amount || 0) / total) * 100) : 0}% paid out</p>
                  </div>
                </div>
                <div className="my-5 border-t border-dashed border-white/20" />
                {contracts.length === 0 && <p className="text-sm text-white/60">Payments show up here once someone is hired.</p>}
                <ul className="space-y-4">
                  {contracts.slice(0, 3).map((j, i) => (
                    <li key={j.id}>
                      <Link to={`/jobs/${j.id}`} className="block">
                        <div className="mb-1.5 flex justify-between gap-3 text-xs text-white/70">
                          <span className="truncate">{j.title}</span>
                          <span className="shrink-0">
                            {compact(j.paid)} / {compact(j.total)}
                          </span>
                        </div>
                        <div className="relative h-8 overflow-hidden rounded-full bg-white/10">
                          <div className={`absolute inset-y-0 left-0 rounded-full ${["bg-gold", "bg-[#e9a23b]", "bg-ticket"][i]}`} style={{ width: `${Math.max(j.total ? (j.paid / j.total) * 100 : 0, 4)}%` }} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Things waiting on the viewer */}
              <section className="tile bg-blush" aria-label="Needs your action">
                <TileHead title="Needs your action">
                  <span className="flex h-9 min-w-9 items-center justify-center border border-white/20 px-3 text-sm font-semibold">{actions.length}</span>
                </TileHead>
                {actions.length === 0 ? (
                  <p className="text-sm text-ink-soft">Nothing waiting on you. Nice.</p>
                ) : (
                  <ul className="space-y-2">
                    {actions.slice(0, 5).map((a, i) => (
                      <li key={a.key}>
                        <Link to={a.step === "Publish" ? `/jobs/${a.jobId}/edit` : `/jobs/${a.jobId}`} className={`flex items-center justify-between gap-3 px-4 py-3 ${i === 0 ? "bg-gold text-poster" : "bg-black/30 hover:bg-black/50"}`}>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{a.title}</span>
                            <span className="block truncate text-xs opacity-70">{a.jobTitle}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            {a.amount != null && <span className="block text-sm font-semibold">{compact(a.amount)}</span>}
                            <span className="block text-xs opacity-70">{a.step}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Jobs */}
              <section className="tile bg-sky lg:col-span-2" aria-label="Your jobs">
                <TileHead title="Your jobs">
                  <IconButton icon="plus" label="Post a job" to="/jobs/new" size={38} />
                </TileHead>
                {jobs.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-black/30 p-5">
                    <p className="text-sm">Post a job or apply to one and it will show up here.</p>
                    <Button to="/jobs/new" size="sm">
                      Post a job
                    </Button>
                  </div>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {jobs.slice(0, 12).map((j) => {
                      const st = jobStatus[j.status] || jobStatus.open;
                      return (
                        <li key={j.id}>
                          <Link to={j.status === "draft" ? `/jobs/${j.id}/edit` : `/jobs/${j.id}`} className="relative flex h-full flex-col bg-black/30 p-4 transition-colors hover:bg-black/50">
                            {j.unread > 0 && (
                              <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center bg-marker px-1 font-mono text-[0.65rem] font-bold text-white" title={`${j.unread} unread message${j.unread === 1 ? "" : "s"}`}>
                                {j.unread}
                              </span>
                            )}
                            <span className="flex items-start justify-between gap-3 pr-6">
                              <span className="font-semibold leading-snug">{j.title}</span>
                              <span className="shrink-0 font-semibold">{compact(j.total)}</span>
                            </span>
                            <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                              <Badge tone={j.status === "draft" ? "amber" : st.tone}>{j.status === "draft" ? "Draft" : st.label}</Badge>
                              {j.demo && <Badge tone="red">Demo</Badge>}
                              <span>
                                {j.role === "client"
                                  ? j.counterpart
                                    ? `You hired ${j.counterpart.name}`
                                    : j.status === "draft"
                                      ? "Not published"
                                      : `You posted · ${j.applicants} applied`
                                  : j.role === "applicant"
                                    ? `You applied · ${(appStatus[j.applicationStatus] || appStatus.pending).label}`
                                    : `For ${j.counterpart?.name}`}
                              </span>
                              <span>· {timeAgo(j.createdAt)}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Arbiter queue */}
              {user?.isAdmin && (
                <section className="tile !border-red-300 lg:col-span-3" aria-label="Disputes">
                  <TileHead title={`Disputes (${disputes?.length ?? "…"})`}>
                    <IconButton icon="shield" label="Admin tools" to="/admin" tone="sage" size={38} />
                  </TileHead>
                  {disputes?.length === 0 && <p className="text-sm text-ink-soft">No disputes waiting for a ruling.</p>}
                  <ul className="grid gap-2 md:grid-cols-2">
                    {disputes?.map((d) => (
                      <li key={d.milestoneId}>
                        <Link to={`/jobs/${d.jobId}`} className="block bg-black/30 p-4 hover:bg-black/50">
                          <span className="flex justify-between gap-3">
                            <span className="font-semibold">{d.title}</span>
                            <span className="font-mono">{compact(d.amount)}</span>
                          </span>
                          <span className="block text-xs text-muted">{d.jobTitle}</span>
                          <span className="mt-2 block text-sm italic text-ink-soft">“{d.reason}”</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Conversations on active jobs */}
              <section className="tile bg-butter" aria-label="Conversations">
                <TileHead title="Conversations">
                  <span className="flex h-9 w-9 items-center justify-center border border-white/20" aria-hidden="true">
                    <Icon name="chat" size={16} />
                  </span>
                </TileHead>
                {talking.length === 0 ? (
                  <p className="text-sm text-ink-soft">Chat opens on a job once someone is hired.</p>
                ) : (
                  <ul className="space-y-2">
                    {talking.slice(0, 5).map((j) => (
                      <li key={j.id}>
                        <Link to={`/jobs/${j.id}#chat`} className="flex items-center gap-3 bg-black/30 p-1.5 pr-2 hover:bg-black/50">
                          <Avatar seed={j.counterpart.id} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{j.counterpart.name}</span>
                            <span className="block truncate text-xs text-muted">{j.title}</span>
                          </span>
                          {j.unread > 0 && <span className="flex h-7 min-w-7 shrink-0 items-center justify-center bg-marker px-1 font-mono text-xs font-bold text-white">{j.unread}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
