import { Link } from "react-router-dom";
import { usdc } from "../lib/format";
import { houseRules, reelDate } from "../lib/cinema";
import { Icon } from "./ui";

// Shared pieces of the picture-house look: posters, reels, bulbs, ticket stubs.

export function Bulbs({ count = 42, className = "" }) {
  return (
    <div aria-hidden="true" className={`flex justify-between ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="bulb h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2"
          style={{ background: "#ffe9a8", boxShadow: "0 0 8px 2px rgb(255 200 80 / 0.7)", animationDelay: `${(i % 6) * 0.25}s` }}
        />
      ))}
    </div>
  );
}

// Shield over a skyline of blocks: the house silhouette on every poster.
function Silhouette() {
  return (
    <svg viewBox="0 0 200 120" className="mt-auto w-full" aria-hidden="true">
      <path d="M100 8 70 20v26c0 20 13 34 30 40 17-6 30-20 30-40V20Z" fill="currentColor" />
      <path d="m88 46 8 8 16-18" stroke="var(--color-gold)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 120V84h22V70h18v14h16V62h20v58Zm124 0V62h20v22h16V70h18v14h22v36Z" fill="currentColor" />
      <rect x="56" y="88" width="88" height="32" fill="currentColor" />
      {[64, 82, 100, 118].map((x) => (
        <rect key={x} x={x} y="98" width="8" height="14" rx="4" fill="var(--color-gold)" />
      ))}
    </svg>
  );
}

export function Poster({ title, tilt = 2, className = "" }) {
  return (
    <div
      className={`relative flex aspect-[3/4] w-full max-w-[13rem] shrink-0 flex-col self-start overflow-hidden border-[3px] border-poster bg-gold p-3 text-poster shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <p className="text-[0.45rem] font-semibold uppercase tracking-[0.14em]">The Blockchain Picture Company</p>
      <p className="poster-title mt-1 line-clamp-3 text-[1.55rem]">{title}</p>
      <Silhouette />
    </div>
  );
}

export function Spec({ label, children }) {
  return (
    <div>
      <dt className="stat-label">{label}</dt>
      <dd className="font-mono text-[0.85rem] text-ink">{children}</dd>
    </div>
  );
}

export function ReelTag({ n, children, dim }) {
  return (
    <p className={`flex flex-wrap items-center gap-3 font-mono text-[0.8rem] text-gold ${dim ? "opacity-70" : ""}`}>
      <span className="border border-gold px-2 py-0.5">Reel Nº{n}</span>
      {children}
    </p>
  );
}

export function Reel({ job, n }) {
  return (
    <article className="flex flex-col gap-6 border border-white/10 bg-surface p-4 sm:flex-row sm:p-5">
      <Poster title={job.title} tilt={n % 2 ? -2 : 2} />
      <div className="min-w-0 flex-1">
        <ReelTag n={n}>{reelDate(job.createdAt)}</ReelTag>
        <h3 className="poster-title mt-3 text-4xl text-ink sm:text-5xl">{job.title}</h3>
        <p className="mt-3 font-serif text-lg italic text-gold">A picture in USDC, paid on delivery</p>
        <p className="mt-3 line-clamp-3 max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">{job.description}</p>
        <dl className="mt-5 grid max-w-xl gap-x-8 gap-y-3 sm:grid-cols-2">
          <Spec label="Budget">{usdc(job.total)} in USDC</Spec>
          <Spec label="Directed by">{job.client.name}</Spec>
          <Spec label="Cast">{job.skills.slice(0, 3).join(", ") || "Open casting"}</Spec>
          <Spec label="Audience">
            {job.applicants} applicant{job.applicants === 1 ? "" : "s"} so far
          </Spec>
        </dl>
        <Link
          to={`/jobs/${job.id}`}
          className="mt-6 inline-flex min-h-11 items-center gap-2 bg-gold px-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-poster hover:brightness-110"
        >
          Take your seat <Icon name="arrow" size={14} />
        </Link>
      </div>
    </article>
  );
}

export function ComingSoon({ n }) {
  return (
    <article className="flex flex-col gap-6 border border-dashed border-white/15 bg-[#121212] p-4 sm:flex-row sm:p-5">
      <div
        className="poster-title flex aspect-[3/4] w-full max-w-[6rem] shrink-0 -rotate-2 items-center justify-center self-start border border-white/10 text-4xl text-white/30"
        style={{ background: "repeating-linear-gradient(135deg, #1c1c1c 0 8px, #161616 8px 16px)" }}
      >
        ?
      </div>
      <div className="min-w-0 flex-1">
        <ReelTag n={n} dim>
          In the edit
        </ReelTag>
        <h3 className="poster-title mt-3 text-4xl text-white/45 sm:text-5xl">Your project here</h3>
        <p className="mt-3 max-w-xl text-[0.95rem] text-muted">
          Title to be announced, possibly by you. Split the budget into milestones and the money waits in escrow until you approve each one.
        </p>
        <Link
          to="/jobs/new"
          className="mt-5 inline-flex min-h-11 items-center gap-2 border border-gold px-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-gold hover:bg-gold/10"
        >
          Post a job <Icon name="arrow" size={14} />
        </Link>
      </div>
    </article>
  );
}

// Heading used above every list: gold poster word, typewriter note, gold rule.
export function BillHeader({ title, note, id }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gold/35 pb-3">
      <h2 id={id} className="poster-title text-5xl text-gold sm:text-6xl">
        {title}
      </h2>
      {note && <p className="font-mono text-[0.75rem] text-muted">{note}</p>}
    </div>
  );
}

export function HouseRules() {
  return (
    <section aria-label="House rules" className="grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
      {houseRules.map(([k, v]) => (
        <div key={k} className="bg-[#0f0e0d] p-5">
          <p className="eyebrow text-gold">{k}</p>
          <p className="mt-1.5 font-mono text-[0.85rem] text-ink-soft">{v}</p>
        </div>
      ))}
    </section>
  );
}
