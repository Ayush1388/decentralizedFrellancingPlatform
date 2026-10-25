import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { appStatus, jobStatus } from "../lib/jobStatus";
import { timeAgo, toUsdc, usdc } from "../lib/format";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, IconButton } from "../Components/ui";

// Milestone states grouped the way a person thinks about money.
const groups = [
  { key: "pending", label: "Not funded", statuses: ["pending"] },
  { key: "escrow", label: "In escrow", statuses: ["funded", "submitted", "disputed"] },
  { key: "paid", label: "Paid out", statuses: ["released", "resolved"] },
  { key: "refunded", label: "Refunded", statuses: ["refunded"] },
];

const filters = [
  { id: "all", label: "All" },
  { id: "client", label: "As client" },
  { id: "freelancer", label: "As freelancer" },
  { id: "applicant", label: "My applications" },
];

// What the viewer should do next on a milestone, if anything.
function nextStep(m, role, job) {
  // Funding only makes sense once someone has been hired.
  if (role === "client" && m.status === "pending" && job.status === "in_progress") return "Fund";
  if (role === "client" && m.status === "submitted") return "Review";
  if (role === "freelancer" && m.status === "funded") return m.feedback ? "Rework" : "Deliver";
  if (m.status === "disputed") return "Disputed";
  return null;
}

const compact = (units) => usdc(units, { compact: true });

function TileHead({ title, children }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="poster-title text-3xl">{title}</h2>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user, ready, openLogin } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [disputes, setDisputes] = useState(null);

  // The arbiter's queue: every frozen milestone waiting for a ruling.
  useEffect(() => {
    if (!user?.isAdmin) return;
    api("/api/admin/disputes")
      .then(setDisputes)
      .catch(() => setDisputes([]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const mine = await api("/api/jobs/mine", { signal: ctl.signal });
        // Milestones live on the job detail; a dashboard only needs the most recent few.
        const details = await Promise.all(mine.slice(0, 12).map((j) => api(`/api/jobs/${j.id}`, { signal: ctl.signal })));
        setJobs(details);
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      }
    })();
    return () => ctl.abort();
  }, [user]);

  const view = useMemo(() => {
    const list = (jobs || []).filter((j) => filter === "all" || j.viewerRole === filter);
    const sums = Object.fromEntries(groups.map((g) => [g.key, { amount: 0, count: 0 }]));
    const actions = [];
    for (const j of list) {
      if (j.viewerRole === "client" && j.status === "open") {
        const n = (j.applications || []).filter((a) => a.status === "pending" || a.status === "shortlisted").length;
        if (n) actions.push({ key: `apps-${j.id}`, job: j, title: `${n} applicant${n > 1 ? "s" : ""} to review`, step: "Hire" });
      }
      if (j.viewerRole === "applicant" && j.myApplication?.status === "shortlisted") {
        actions.push({ key: `short-${j.id}`, job: j, title: "You are shortlisted", step: "Reply" });
      }
      // Money only counts on real contracts; a posting's milestones are a template until someone is hired.
      if (!j.freelancer || j.viewerRole === "applicant") continue;
      for (const m of j.milestones) {
        const g = groups.find((x) => x.statuses.includes(m.status));
        if (g) {
          sums[g.key].amount += m.amount;
          sums[g.key].count += 1;
        }
        const step = nextStep(m, j.viewerRole, j);
        if (step) actions.push({ key: m.id, job: j, title: m.title, amount: m.amount, step });
      }
    }
    return { list, sums, actions };
  }, [jobs, filter]);

  if (ready && !user) {
    return (
      <div className="container-page pt-10">
        <EmptyState image="/Work time-rafiki.svg" title="Log in to see your dashboard" action={<Button onClick={openLogin}>Log in</Button>}>
          Your jobs, milestones and payments in one place.
        </EmptyState>
      </div>
    );
  }

  const { list, sums, actions } = view;
  const maxGroup = Math.max(1, ...groups.map((g) => sums[g.key].amount));
  const total = groups.reduce((t, g) => t + sums[g.key].amount, 0);
  const counterpart = (j) => (j.viewerRole === "client" ? j.freelancer : j.client);
  const talking = list.filter((j) => j.status === "in_progress" && counterpart(j) && (j.viewerRole === "client" || j.viewerRole === "freelancer"));
  const contracts = list.filter((j) => j.freelancer && j.viewerRole !== "applicant");

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
          <p className="stat-value mt-1">{jobs ? `${list.length} total` : "—"}</p>
        </div>
        <div>
          <p className="stat-label">In escrow</p>
          <p className="stat-value mt-1">{jobs ? usdc(sums.escrow.amount) : "—"}</p>
        </div>
        <div>
          <p className="stat-label">Paid out</p>
          <p className="stat-value mt-1">{jobs ? usdc(sums.paid.amount) : "—"}</p>
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
              className={`eyebrow inline-flex min-h-11 items-center px-5 transition-colors ${
                filter === f.id ? "bg-gold text-poster" : "border border-[#3a3733] hover:border-gold hover:text-gold"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <IconButton icon="plus" label="Post a job" to="/jobs/new" tone="sage" />
          <IconButton icon="wallet" label="Wallet" to="/wallet" tone="sage" />
        </div>
      </div>

      <div className="mt-6">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {!jobs && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} className="h-72" />
          ))}
        </div>
      ) : (
        jobs && (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Milestones by state, hatched bars */}
            <section className="tile flex flex-col" aria-label="Milestones">
              <TileHead title={`Milestones (${groups.reduce((t, g) => t + sums[g.key].count, 0)})`}>
                <IconButton icon="arrowUpRight" label="All jobs" to="/jobs" tone="sage" size={38} />
              </TileHead>
              <div className="mt-auto flex h-48 items-end gap-3">
                {groups.map((g) => {
                  const h = Math.max(6, (sums[g.key].amount / maxGroup) * 100);
                  return (
                    <div key={g.key} className="flex h-full flex-1 flex-col justify-end">
                      <p className="text-xs text-muted">{g.label}</p>
                      <p className="mb-1.5 text-sm font-semibold">{compact(sums[g.key].amount)}</p>
                      <div className="hatch bg-sage" style={{ height: `${h}%` }} />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Payments per job */}
            <section className="tile !border-gold/40 bg-[#0f0e0d]" aria-label="Payments">
              <div className="flex items-start justify-between gap-3">
                <h2 className="poster-title text-3xl">Payments</h2>
                <div className="text-right">
                  <p className="text-xl font-semibold">{usdc(total)}</p>
                  <p className="text-xs text-gold">{total ? Math.round((sums.paid.amount / total) * 100) : 0}% paid out</p>
                </div>
              </div>
              <div className="my-5 border-t border-dashed border-white/20" />
              {contracts.length === 0 && <p className="text-sm text-white/60">Payments show up here once someone is hired.</p>}
              <ul className="space-y-4">
                {contracts.slice(0, 3).map((j, i) => {
                  const paid = j.milestones.filter((m) => ["released", "resolved"].includes(m.status)).reduce((t, m) => t + m.amount, 0);
                  const pct = j.total ? (paid / j.total) * 100 : 0;
                  return (
                    <li key={j.id}>
                      <Link to={`/jobs/${j.id}`} className="block">
                        <div className="mb-1.5 flex justify-between gap-3 text-xs text-white/70">
                          <span className="truncate">{j.title}</span>
                          <span className="shrink-0">
                            {compact(paid)} / {compact(j.total)}
                          </span>
                        </div>
                        <div className="relative h-8 overflow-hidden rounded-full bg-white/10">
                          <div className={`absolute inset-y-0 left-0 rounded-full ${["bg-gold", "bg-[#e9a23b]", "bg-ticket"][i]}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
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
                  {actions.slice(0, 4).map(({ key, job, title, amount, step }, i) => (
                    <li key={key}>
                      <Link
                        to={`/jobs/${job.id}`}
                        className={`flex items-center justify-between gap-3 px-4 py-3 ${i === 0 ? "bg-gold text-poster" : "bg-black/30 hover:bg-black/50"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{title}</span>
                          <span className="block truncate text-xs opacity-70">{job.title}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          {amount != null && <span className="block text-sm font-semibold">{compact(amount)}</span>}
                          <span className="block text-xs opacity-70">{step}</span>
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
              {list.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4 bg-black/30 p-5">
                  <p className="text-sm">Post a job or apply to one and it will show up here.</p>
                  <Button to="/jobs/new" size="sm">
                    Post a job
                  </Button>
                </div>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((j) => {
                    const st = jobStatus[j.status] || jobStatus.open;
                    return (
                      <li key={j.id}>
                        <Link to={`/jobs/${j.id}`} className="flex h-full flex-col bg-black/30 p-4 transition-colors hover:bg-black/50">
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-semibold leading-snug">{j.title}</span>
                            <span className="shrink-0 font-semibold">{compact(j.total)}</span>
                          </span>
                          <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {j.demo && <Badge tone="red">Demo</Badge>}
                            <span>
                              {j.viewerRole === "client"
                                ? j.freelancer
                                  ? `You hired ${j.freelancer.name}`
                                  : `You posted · ${j.applicants} applied`
                                : j.viewerRole === "applicant"
                                  ? `You applied · ${(appStatus[j.myApplication?.status] || appStatus.pending).label}`
                                  : `For ${j.client.name}`}
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
              <section className="tile lg:col-span-3 !border-red-300" aria-label="Disputes">
                <TileHead title={`Disputes (${disputes?.length ?? "…"})`} />
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
                  {talking.slice(0, 4).map((j) => {
                    const who = counterpart(j);
                    const open = j.milestones.filter((m) => !["released", "resolved", "refunded"].includes(m.status)).length;
                    return (
                      <li key={j.id}>
                        <Link to={`/jobs/${j.id}#chat`} className="flex items-center gap-3 bg-black/30 p-1.5 pr-2 hover:bg-black/50">
                          <Avatar seed={who.id} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{who.name}</span>
                            <span className="block truncate text-xs text-muted">{j.title}</span>
                          </span>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-gold/40 text-sm text-gold font-semibold" title="Open milestones">
                            {open}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )
      )}
      {jobs && toUsdc(total) === 0 && list.length > 0 && <p className="mt-4 px-1 text-sm text-muted">Amounts appear once milestones are added to a job.</p>}
    </div>
  );
}
