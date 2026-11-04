import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiList } from "../lib/api";
import { jobStatus } from "../lib/jobStatus";
import { useAuth } from "../context/useAuth";
import { timeAgo, usdc } from "../lib/format";
import { useSiteConfig } from "../lib/siteConfig";
import { PosterCard, Reel } from "../Components/cinema";
import FilterChips from "../Components/FilterChips";
import Carousel, { ViewToggle } from "../Components/Carousel";
import { useViewMode } from "../lib/useViewMode";
import { Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, PageHeader, SkillChip, Tabs } from "../Components/ui";

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
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 className="text-xl font-semibold leading-snug">{job.title}</h3>
        <p className="text-lg font-semibold tabular-nums">{usdc(job.total)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {job.client.name}, {timeAgo(job.createdAt)}
        {job.status === "open" && `, ${job.applicants} applicant${job.applicants === 1 ? "" : "s"}`}
      </p>
      <p className="mt-3 line-clamp-2 text-ink-soft">{job.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {job.parentId && <Badge>Contract</Badge>}
        {job.demo && <Badge tone="red">Demo</Badge>}
        {job.skills.slice(0, 4).map((s) => (
          <SkillChip key={s}>{s}</SkillChip>
        ))}
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

  const extraKeys = ["level", "duration", "skill", "minBudget", "maxBudget"];
  const extraActive = extraKeys.filter((k) => params.get(k)).length;
  const [more, setMore] = useState(extraActive > 0);
  const select = "input text-[0.9375rem]";
  return (
    <section aria-label="Filters" className="mb-6 space-y-3">
      <FilterChips
        label="Kind of work"
        options={[{ id: "", label: "All jobs" }, ...categories.map((c) => ({ id: c, label: c }))]}
        value={params.get("category") || ""}
        onChange={(c) => setParam({ category: c })}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <label htmlFor="job-search" className="sr-only">
            Search jobs
          </label>
          <input id="job-search" type="search" placeholder="Search by title, description or skill" value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-11" />
        </div>
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
        <button
          type="button"
          aria-expanded={more}
          aria-controls="more-filters"
          onClick={() => setMore(!more)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#3d3332] px-4 text-[0.9375rem] font-medium text-ink-soft hover:border-[#6a5a55] hover:text-ink sm:col-span-2 lg:col-span-1"
        >
          <Icon name="sliders" size={18} />
          More filters
          {extraActive > 0 && <span className="rounded-full bg-gold px-1.5 text-xs font-semibold text-poster">{extraActive}</span>}
        </button>
      </div>
      {more && (
        <div id="more-filters" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <input id="f-skill" placeholder="Skill, e.g. Solidity" value={skill} onChange={(e) => setSkill(e.target.value)} className="input" />
          <label className="sr-only" htmlFor="f-min">
            Minimum budget in USDC
          </label>
          <input id="f-min" type="number" min="0" inputMode="numeric" placeholder="Min budget, USDC" value={min} onChange={(e) => setMin(e.target.value)} className="input" />
          <label className="sr-only" htmlFor="f-max">
            Maximum budget in USDC
          </label>
          <input id="f-max" type="number" min="0" inputMode="numeric" placeholder="Max budget, USDC" value={max} onChange={(e) => setMax(e.target.value)} className="input" />
        </div>
      )}
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
          className="min-h-9 text-sm font-medium text-gold hover:underline"
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
  const [view, setView] = useViewMode("jobs");
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
  const summary = jobs && (
    <p className="text-sm text-muted" aria-live="polite">
      {tab === "open" ? `${total} job${total === 1 ? "" : "s"}${activeCount ? " match your filters" : " open for applications"}` : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
    </p>
  );
  const toggle = <ViewToggle mode={view} onChange={setView} label="How to browse jobs" />;

  return (
    <div className="container-page pb-8">
      <PageHeader
        title="Jobs"
        subtitle="Every job is split into milestones and paid from escrow in USDC."
        action={
          <Button to="/jobs/new">
            <Icon name="plus" size={18} /> Post a job
          </Button>
        }
      />

      <Tabs label="Job lists" tabs={tabs} value={tab} onChange={(id) => setParams(id === "open" ? {} : { tab: id })} className="mb-6" />

      {tab === "open" && <Filters params={params} setParam={setParam} clear={clear} activeCount={activeCount} />}

      <ErrorNote>{error}</ErrorNote>
      {jobs?.length > 0 && !(tab !== "mine" && view === "swipe") && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {summary}
          {tab !== "mine" && toggle}
        </div>
      )}

      {tab !== "mine" && view === "swipe" && jobs?.length > 0 ? (
        <div role="tabpanel">
          <Carousel label="Jobs" perView={4} lead={summary} tools={toggle} resetKey={query}>
            {jobs.map((j, i) => (
              <PosterCard key={j.id} job={j} n={(page - 1) * PAGE + i + 1} />
            ))}
          </Carousel>
        </div>
      ) : (
        <div className="space-y-4" role="tabpanel" aria-busy={jobs === null}>
          {jobs === null && !error && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} className="h-40" />)}
          {jobs?.map((j, i) => (tab === "mine" ? <JobCard key={j.id} job={j} /> : <Reel key={j.id} job={j} n={(page - 1) * PAGE + i + 1} />))}
        </div>
      )}

      {tab === "open" && jobs && total > PAGE && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => (setParam({ page: String(page - 1) }), window.scrollTo(0, 0))}>
            Previous
          </Button>
          <span className="text-sm tabular-nums text-muted">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => (setParam({ page: String(page + 1) }), window.scrollTo(0, 0))}>
            Next
          </Button>
        </nav>
      )}

      {jobs?.length === 0 &&
        ((tab === "mine" || tab === "saved") && !user ? (
          <EmptyState icon="lock" title={tab === "saved" ? "Log in to see saved jobs" : "Log in to see your jobs"} action={<Button onClick={openLogin}>Log in</Button>} />
        ) : (
          <EmptyState
            icon={tab === "saved" ? "bookmark" : "briefcase"}
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
