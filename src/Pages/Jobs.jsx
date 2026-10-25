import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { jobStatus } from "../lib/jobStatus";
import { useAuth } from "../context/useAuth";
import { timeAgo, usdc } from "../lib/format";
import { Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, PageHeader, SkillChip } from "../Components/ui";


export function JobCard({ job }) {
  const st = jobStatus[job.status] || jobStatus.open;
  return (
    <Link to={`/jobs/${job.id}`} className="card card-hover block p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{job.title}</h3>
        <p className="text-lg font-semibold">{usdc(job.total)}</p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{job.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {job.skills.slice(0, 4).map((s) => (
          <SkillChip key={s}>{s}</SkillChip>
        ))}
        <span className="ml-auto text-xs text-muted">
          {job.client.name} · {timeAgo(job.createdAt)}
          {job.status === "open" && ` · ${job.applicants} applicant${job.applicants === 1 ? "" : "s"}`}
        </span>
      </div>
    </Link>
  );
}

export default function Jobs() {
  const { user, openLogin } = useAuth();
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (tab === "mine" && !user) {
      setJobs([]);
      return;
    }
    const ctl = new AbortController();
    setJobs(null);
    const path = tab === "mine" ? "/api/jobs/mine" : `/api/jobs?status=open${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`;
    api(path, { signal: ctl.signal })
      .then((d) => {
        setJobs(d);
        setError("");
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [tab, debounced, user]);

  const tabs = [
    { id: "open", label: "Open jobs" },
    { id: "mine", label: "My jobs" },
  ];

  return (
    <div className="container-page pb-8">
      <PageHeader
        title="Jobs"
        image="/Working from anywhere-bro.svg"
        subtitle="Every job is split into milestones and paid from escrow in USDC."
        action={
          <Button to="/jobs/new">
            <Icon name="plus" size={18} /> Post a job
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Job lists" className="inline-flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors ${tab === t.id ? "bg-ink text-white" : "border border-ink/20 hover:bg-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "open" && (
          <div className="relative w-full sm:w-72">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <label htmlFor="job-search" className="sr-only">
              Search jobs
            </label>
            <input id="job-search" type="search" placeholder="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-11" />
          </div>
        )}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="space-y-4" role="tabpanel" aria-busy={jobs === null}>
        {jobs === null && !error && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} className="h-32" />)}
        {jobs?.map((j) => <JobCard key={j.id} job={j} />)}
      </div>

      {jobs?.length === 0 &&
        (tab === "mine" && !user ? (
          <EmptyState image="/Work time-rafiki.svg" title="Log in to see your jobs" action={<Button onClick={openLogin}>Log in</Button>} />
        ) : (
          <EmptyState image="/Work time-rafiki.svg" title={tab === "mine" ? "You have no jobs yet" : debounced ? "No jobs match your search" : "No open jobs right now"} action={<Button to="/jobs/new">Post the first one</Button>}>
            {tab === "mine" ? "Jobs you post or apply to will show up here." : "Check back soon, or post a job of your own."}
          </EmptyState>
        ))}
    </div>
  );
}
