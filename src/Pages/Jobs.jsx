import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiList } from "../lib/api";
import { jobStatus } from "../lib/jobStatus";
import { useAuth } from "../context/useAuth";
import { timeAgo, usdc } from "../lib/format";
import { useSiteConfig } from "../lib/siteConfig";
import { Reel } from "../Components/cinema";
import { Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, PageHeader, SkillChip } from "../Components/ui";

const PAGE = 10;
const LEVELS = ["Entry", "Intermediate", "Expert"];
const DURATIONS = ["Less than a week", "1 to 4 weeks", "1 to 3 months", "More than 3 months"];
const SORTS = [
  ["newest", "Newest first"],
  ["closing", "Closing soon"],
  ["budget_desc", "Budget: high to low"],
  ["budget_asc", "Budget: low to high"],
];

// A compact row for "My jobs", where the job's state matters more than its poster.
export function JobCard({ job }) {
  const st = jobStatus[job.status] || jobStatus.open;
  return (
    <Link to={job.status === "draft" ? `/jobs/${job.id}/edit` : `/jobs/${job.id}`} className="card card-hover block p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="poster-title text-3xl">{job.title}</h3>
        <p className="font-mono text-lg font-bold text-gold">{usdc(job.total)}</p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{job.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {job.demo && <Badge tone="red">Demo</Badge>}
        {job.skills.slice(0, 4).map((s) => (
          <SkillChip key={s}>{s}</SkillChip>
        ))}
        <span className="ml-auto text-xs text-muted">
          {job.client.name} · {timeAgo(job.createdAt)}
          {job.status === "open" && ` · ${job.applicants} applicant${job.applicants === 1 ? "" : "s"}`}
          {job.parentId && " · contract"}
        </span>
      </div>
    </Link>
  );
}

function Filters({ params, setParam, clear, activeCount }) {
  const { categories } = useSiteConfig();
  const [q, setQ] = useState(params.get("q") || "");
  const [skill, setSkill] = useState(params.get("skill") || "");
  const [min, setMin] = useState(params.get("minBudget") || "");
  const [max, setMax] = useState(params.get("maxBudget") || "");

  // Typing waits a moment before it hits the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setParam({ q: q.trim(), skill: skill.trim(), minBudget: min, maxBudget: max });
    }, 350);
    return () => clearTimeout(t);
    // setParam changes every render; the typed values are what should retrigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, skill, min, max]);

  const select = "input !min-h-10 !py-1.5 text-sm";
  return (
    <section aria-label="Filters" className="card mb-6 space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <label htmlFor="job-search" className="sr-only">
            Search jobs
          </label>
          <input id="job-search" type="search" placeholder="Search title, description or skill" value={q} onChange={(e) => setQ(e.target.value)} className="input !min-h-10 !pl-10" />
        </div>
        <label className="sr-only" htmlFor="f-category">
          Category
        </label>
        <select id="f-category" className={select} value={params.get("category") || ""} onChange={(e) => setParam({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-sort">
          Sort by
        </label>
        <select id="f-sort" className={select} value={params.get("sort") || "newest"} onChange={(e) => setParam({ sort: e.target.value === "newest" ? "" : e.target.value })}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="sr-only" htmlFor="f-level">
          Experience level
        </label>
        <select id="f-level" className={select} value={params.get("level") || ""} onChange={(e) => setParam({ level: e.target.value })}>
          <option value="">Any level</option>
          {LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-duration">
          Duration
        </label>
        <select id="f-duration" className={select} value={params.get("duration") || ""} onChange={(e) => setParam({ duration: e.target.value })}>
          <option value="">Any duration</option>
          {DURATIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-skill">
          Skill
        </label>
        <input id="f-skill" placeholder="Skill, e.g. Solidity" value={skill} onChange={(e) => setSkill(e.target.value)} className="input !min-h-10 text-sm" />
        <label className="sr-only" htmlFor="f-min">
          Minimum budget in USDC
        </label>
        <input id="f-min" type="number" min="0" inputMode="numeric" placeholder="Min budget (USDC)" value={min} onChange={(e) => setMin(e.target.value)} className="input !min-h-10 text-sm" />
        <label className="sr-only" htmlFor="f-max">
          Maximum budget in USDC
        </label>
        <input id="f-max" type="number" min="0" inputMode="numeric" placeholder="Max budget (USDC)" value={max} onChange={(e) => setMax(e.target.value)} className="input !min-h-10 text-sm" />
      </div>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            setSkill("");
            setMin("");
            setMax("");
            clear();
          }}
          className="text-xs text-gold underline-offset-2 hover:underline"
        >
          Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}

export default function Jobs() {
  const { user, openLogin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "open";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [jobs, setJobs] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // Changing a filter returns to page 1; empty values leave the address clean.
  const setParam = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  const clear = () => setParams((p) => new URLSearchParams({ ...(p.get("tab") ? { tab: p.get("tab") } : {}) }), { replace: true });

  const filterKeys = ["q", "category", "level", "duration", "skill", "minBudget", "maxBudget"];
  const activeCount = filterKeys.filter((k) => params.get(k)).length;
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of [...filterKeys, "sort"]) if (params.get(k)) q.set(k, params.get(k));
    q.set("limit", PAGE);
    q.set("page", page);
    return q.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, page]);

  useEffect(() => {
    if ((tab === "mine" || tab === "saved") && !user) {
      setJobs([]);
      setTotal(0);
      return;
    }
    const ctl = new AbortController();
    setJobs(null);
    const run =
      tab === "mine"
        ? api("/api/jobs/mine", { signal: ctl.signal }).then((d) => ({ items: d, total: d.length }))
        : tab === "saved"
          ? api("/api/jobs/saved", { signal: ctl.signal }).then((d) => ({ items: d, total: d.length }))
          : apiList(`/api/jobs?${query}`, { signal: ctl.signal });
    run
      .then(({ items, total }) => {
        setJobs(items);
        setTotal(total);
        setError("");
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [tab, query, user]);

  const tabs = [
    { id: "open", label: "Open jobs" },
    { id: "saved", label: "Saved" },
    { id: "mine", label: "My jobs" },
  ];
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="container-page pb-8">
      <PageHeader
        eyebrow="The programme"
        title="Now showing"
        image="/Working from anywhere-bro.svg"
        subtitle="Every job is split into milestones and paid from escrow in USDC."
        action={
          <Button to="/jobs/new">
            <Icon name="plus" size={18} /> Post a job
          </Button>
        }
      />

      <div role="tablist" aria-label="Job lists" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === "open" ? {} : { tab: t.id })}
            className={`eyebrow min-h-11 px-5 transition-colors ${tab === t.id ? "bg-gold text-poster" : "border border-[#3a3733] hover:border-gold hover:text-gold"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "open" && <Filters params={params} setParam={setParam} clear={clear} activeCount={activeCount} />}

      <ErrorNote>{error}</ErrorNote>
      {tab === "open" && jobs && <p className="mb-3 font-mono text-xs text-muted" aria-live="polite">{total} job{total === 1 ? "" : "s"}{activeCount ? " match your filters" : " open for applications"}</p>}

      <div className="space-y-4" role="tabpanel" aria-busy={jobs === null}>
        {jobs === null && !error && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} className="h-40" />)}
        {jobs?.map((j, i) => (tab === "mine" ? <JobCard key={j.id} job={j} /> : <Reel key={j.id} job={j} n={(page - 1) * PAGE + i + 1} />))}
      </div>

      {tab === "open" && jobs && total > PAGE && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => (setParam({ page: String(page - 1) }), window.scrollTo(0, 0))}>
            ← Previous
          </Button>
          <span className="font-mono text-sm text-muted">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => (setParam({ page: String(page + 1) }), window.scrollTo(0, 0))}>
            Next →
          </Button>
        </nav>
      )}

      {jobs?.length === 0 &&
        ((tab === "mine" || tab === "saved") && !user ? (
          <EmptyState image="/Work time-rafiki.svg" title={tab === "saved" ? "Log in to see saved jobs" : "Log in to see your jobs"} action={<Button onClick={openLogin}>Log in</Button>} />
        ) : (
          <EmptyState
            image="/Work time-rafiki.svg"
            title={tab === "mine" ? "You have no jobs yet" : tab === "saved" ? "No saved jobs" : activeCount ? "No jobs match your filters" : "No open jobs right now"}
            action={
              tab === "open" && activeCount ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button to={tab === "saved" ? "/jobs" : "/jobs/new"}>{tab === "saved" ? "Browse jobs" : "Post the first one"}</Button>
              )
            }
          >
            {tab === "mine"
              ? "Jobs you post or apply to will show up here."
              : tab === "saved"
                ? "Tap the bookmark on a job to keep it here."
                : activeCount
                  ? "Try fewer filters or a wider budget."
                  : "Check back soon, or post a job of your own."}
          </EmptyState>
        ))}
    </div>
  );
}
