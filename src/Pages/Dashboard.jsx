import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { appStatus, jobStatus } from "../lib/jobStatus";
import { timeAgo, usdc } from "../lib/format";
import { useEmailSetting } from "../lib/useEmailSetting";
import { useChainConfig } from "../context/useChainConfig";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, PageHeader, Tabs } from "../Components/ui";

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
  { id: "applicant", label: "Applications" },
];

const compact = (units) => usdc(units, { compact: true });

function TileHead({ title, count, children }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">
        {title}
        {count != null && <span className="ml-2 font-normal tabular-nums text-muted">{count}</span>}
      </h2>
      {children}
    </div>
  );
}

// One quiet row inside a panel: what it is on the left, the figure or state on the right.
const row = "flex items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/[0.04]";

function Unread({ n }) {
  if (!n) return null;
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-marker px-1.5 text-xs font-semibold tabular-nums text-poster" title={`${n} unread message${n === 1 ? "" : "s"}`}>
      {n}
    </span>
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
    jobs.length === 0 && { to: "/jobs", title: "Find a job or post one", text: "Browse open jobs, or describe the work you need done." },
  ].filter(Boolean);
  if (!steps.length) return null;
  return (
    <section className="card p-5 !border-gold/30" aria-label="Get started">
      <TileHead title="Get started" />
      <ul className="grid gap-2 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title}>
            <Link to={s.to} className="block h-full rounded-lg bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]">
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
        <EmptyState as="h1" icon="grid" title="Log in to see your dashboard" action={<Button onClick={openLogin}>Log in</Button>}>
          Your jobs, milestones and payments in one place.
        </EmptyState>
      </div>
    );
  }

  const jobs = (data?.jobs || []).filter((j) => filter === "all" || j.role === filter);
  const sums = data?.sums || {};
  const actions = (data?.actions || []).filter((a) => filter === "all" || (data?.jobs || []).find((j) => j.id === a.jobId)?.role === filter);
  const total = groups.reduce((t, g) => t + (sums[g.key]?.amount || 0), 0);
  const contracts = jobs.filter((j) => j.role !== "applicant" && j.total > 0 && ["in_progress", "completed"].includes(j.status));
  const talking = jobs.filter((j) => j.status === "in_progress" && j.counterpart && j.role !== "applicant");

  return (
    <div className="container-page pb-4">
      <PageHeader
        title="Dashboard"
        subtitle={user ? `Signed in as ${user.name}.` : undefined}
        action={
          <div className="flex gap-2">
            <Button to="/wallet" variant="secondary">
              <Icon name="wallet" size={18} /> Wallet
            </Button>
            <Button to="/jobs/new">
              <Icon name="plus" size={18} /> Post a job
            </Button>
          </div>
        }
      />

      {/* Where the money is, across every contract */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4">
        {groups.map((g) => (
          <div key={g.key}>
            <dt className="stat-label">{g.label}</dt>
            <dd className="stat-value mt-1">{data ? usdc(sums[g.key]?.amount || 0) : "–"}</dd>
            <dd className="text-sm tabular-nums text-muted">{data ? `${sums[g.key]?.count || 0} milestone${sums[g.key]?.count === 1 ? "" : "s"}` : ""}</dd>
          </div>
        ))}
      </dl>

      <Tabs label="Filter by role" tabs={filters} value={filter} onChange={setFilter} className="mt-8" />

      <div className="mt-6">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {!data && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <CardSkeleton className="h-72 lg:col-span-2" />
          <CardSkeleton className="h-72" />
        </div>
      ) : (
        data && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              <GetStarted user={user} jobs={data.jobs} />

              {/* Things waiting on the viewer come first */}
              <section className="card p-5" aria-label="Needs your action">
                <TileHead title="Needs your action" count={actions.length} />
                {actions.length === 0 ? (
                  <p className="px-3 pb-1 text-ink-soft">Nothing is waiting on you.</p>
                ) : (
                  <ul className="-mx-1 divide-y divide-line">
                    {actions.slice(0, 6).map((a) => (
                      <li key={a.key}>
                        <Link to={a.step === "Publish" ? `/jobs/${a.jobId}/edit` : `/jobs/${a.jobId}`} className={row}>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            <span className="block truncate text-sm text-muted">{a.jobTitle}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            {a.amount != null && <span className="font-semibold tabular-nums">{compact(a.amount)}</span>}
                            <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-poster">{a.step}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-5" aria-label="Your jobs">
                <TileHead title="Your jobs" count={jobs.length}>
                  <Link to="/jobs?tab=mine" className="inline-flex min-h-10 items-center text-sm font-medium text-gold hover:underline">
                    See all
                  </Link>
                </TileHead>
                {jobs.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white/[0.04] p-4">
                    <p className="text-ink-soft">Jobs you post or apply to show up here.</p>
                    <Button to="/jobs/new" size="sm">
                      Post a job
                    </Button>
                  </div>
                ) : (
                  <ul className="-mx-1 divide-y divide-line">
                    {jobs.slice(0, 12).map((j) => {
                      const st = jobStatus[j.status] || jobStatus.open;
                      const who =
                        j.role === "client"
                          ? j.counterpart
                            ? `You hired ${j.counterpart.name}`
                            : j.status === "draft"
                              ? "Not published yet"
                              : `${j.applicants} applied`
                          : j.role === "applicant"
                            ? `You applied: ${(appStatus[j.applicationStatus] || appStatus.pending).label.toLowerCase()}`
                            : `Working for ${j.counterpart?.name}`;
                      return (
                        <li key={j.id}>
                          <Link to={j.status === "draft" ? `/jobs/${j.id}/edit` : `/jobs/${j.id}`} className={row}>
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium">{j.title}</span>
                                <Unread n={j.unread} />
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                                <Badge tone={j.status === "draft" ? "amber" : st.tone}>{j.status === "draft" ? "Draft" : st.label}</Badge>
                                {j.demo && <Badge tone="red">Demo</Badge>}
                                <span>{who}</span>
                                <span>{timeAgo(j.createdAt)}</span>
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">{compact(j.total)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Arbiter queue */}
              {user?.isAdmin && (
                <section className="card p-5 !border-red-300" aria-label="Disputes">
                  <TileHead title="Disputes" count={disputes?.length ?? "…"}>
                    <Link to="/admin" className="inline-flex min-h-10 items-center text-sm font-medium text-gold hover:underline">
                      Admin tools
                    </Link>
                  </TileHead>
                  {disputes?.length === 0 && <p className="px-3 pb-1 text-ink-soft">No disputes are waiting for a ruling.</p>}
                  <ul className="-mx-1 divide-y divide-line">
                    {disputes?.map((d) => (
                      <li key={d.milestoneId}>
                        <Link to={`/jobs/${d.jobId}`} className={`${row} !items-start`}>
                          <span className="min-w-0">
                            <span className="block font-medium">{d.title}</span>
                            <span className="block text-sm text-muted">{d.jobTitle}</span>
                            <span className="mt-1.5 block text-sm italic text-ink-soft">“{d.reason}”</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{compact(d.amount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              {/* Payments per contract */}
              <section className="card p-5" aria-label="Payments">
                <TileHead title="Payments">
                  <span className="text-sm tabular-nums text-muted">{total ? Math.round(((sums.paid?.amount || 0) / total) * 100) : 0}% paid out</span>
                </TileHead>
                {contracts.length === 0 && <p className="text-ink-soft">Payments show up here once someone is hired.</p>}
                <ul className="space-y-4">
                  {contracts.slice(0, 4).map((j) => (
                    <li key={j.id}>
                      <Link to={`/jobs/${j.id}`} className="group block">
                        <span className="mb-1.5 flex justify-between gap-3 text-sm">
                          <span className="truncate group-hover:text-gold">{j.title}</span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {compact(j.paid)} of {compact(j.total)}
                          </span>
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.max(j.total ? (j.paid / j.total) * 100 : 0, 2)}%` }} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Conversations on active jobs */}
              <section className="card p-5" aria-label="Conversations">
                <TileHead title="Conversations" />
                {talking.length === 0 ? (
                  <p className="text-ink-soft">Chat opens on a job once someone is hired.</p>
                ) : (
                  <ul className="-mx-1 space-y-1">
                    {talking.slice(0, 5).map((j) => (
                      <li key={j.id}>
                        <Link to={`/jobs/${j.id}#chat`} className={`${row} !justify-start !py-2`}>
                          <Avatar seed={j.counterpart.id} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{j.counterpart.name}</span>
                            <span className="block truncate text-sm text-muted">{j.title}</span>
                          </span>
                          <Unread n={j.unread} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )
      )}
    </div>
  );
}
