import { Link } from "react-router-dom";
import { m } from "motion/react";
import { closesIn, plural, timeAgo, usdc } from "../lib/format";
import { houseRules, posterStock } from "../lib/cinema";
import { useSaved } from "../lib/useSaved";
import { useLift } from "../lib/useLift";
import { Badge, Button, Icon, SkillChip } from "./ui";

// The printed side of the Picture House: marquee bulbs, one-sheet posters, the rubber stamp.

// Marquee bulbs running a chase, the way a cinema front announces the show.
export function Bulbs({ count = 42, className = "" }) {
  return (
    <div aria-hidden="true" className={`marquee flex justify-between ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="bulb h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ "--i": i % 6 }} />
      ))}
    </div>
  );
}

// Rubber stamp on printed stock marking seeded sample data.
export function DemoStamp({ className = "" }) {
  return (
    <span
      title="Sample data for demos"
      className={`pointer-events-none inline-block -rotate-12 border-2 border-curtain px-1.5 pt-0.5 font-poster text-sm uppercase leading-tight tracking-wide text-curtain ${className}`}
    >
      Demo
    </span>
  );
}

// Shield over a skyline: the house silhouette printed at the foot of every poster.
function Silhouette({ stock }) {
  return (
    <svg viewBox="0 0 200 120" className="mt-auto w-full" aria-hidden="true">
      <path d="M100 8 70 20v26c0 20 13 34 30 40 17-6 30-20 30-40V20Z" fill="currentColor" />
      <path d="m88 46 8 8 16-18" stroke={stock} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 120V84h22V70h18v14h16V62h20v58Zm124 0V62h20v22h16V70h18v14h22v36Z" fill="currentColor" />
      <rect x="56" y="88" width="88" height="32" fill="currentColor" />
      {[64, 82, 100, 118].map((x) => (
        <rect key={x} x={x} y="98" width="8" height="14" rx="4" fill={stock} />
      ))}
    </svg>
  );
}

// A one-sheet for a job. The poster names the kind of work, on that kind's own stock; the title lives in the card.
// Its type is sized from the poster's own width, so it prints the same at any size.
export function Poster({ genre, tilt = 0, demo, small = false, className = "" }) {
  const stock = posterStock(genre);
  return (
    <div
      className={`@container relative flex aspect-[3/4] shrink-0 flex-col self-start overflow-hidden border-poster text-poster shadow-[0_18px_36px_-14px_rgb(0_0_0/0.85)] ${small ? "w-20 border-2 p-2 sm:w-28" : "w-full max-w-[11rem] border-[3px] p-3"} ${className}`}
      style={{ background: stock, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <p aria-hidden="true" className="hidden text-[4.4cqw] font-semibold uppercase tracking-[0.12em] opacity-80 @[7.5rem]:block">
        The Blockchain Picture Company presents
      </p>
      <p className="poster-title mt-[3cqw] line-clamp-3 text-[14.5cqw] !leading-none">
        {genre ? (
          <>
            <span className="sr-only">Category: </span>
            {genre}
          </>
        ) : (
          <span aria-hidden="true">Now showing</span>
        )}
      </p>
      <Silhouette stock={stock} />
      {demo && <DemoStamp className="absolute right-[6%] top-[46%] bg-ticket/85 !text-[9cqw]" />}
    </div>
  );
}

const hang = { type: "spring", stiffness: 260, damping: 18 };

// Holds a poster at its tilt; when the card it belongs to is hovered or focused, the poster straightens and rises.
export function Hang({ tilt = 2, className = "", children }) {
  return (
    <m.div className={className} variants={{ rest: { rotate: tilt, y: 0, scale: 1 }, lift: { rotate: 0, y: -6, scale: 1.035 } }} transition={hang}>
      {children}
    </m.div>
  );
}

export function Spec({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="stat-label">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

// A bookmark for a job card. Hidden for visitors who are not signed in.
export function SaveButton({ jobId, className = "" }) {
  const { saved, toggle, signedIn } = useSaved();
  if (!signedIn) return null;
  const on = saved.has(jobId);
  return (
    <button
      type="button"
      onClick={() => toggle(jobId)}
      aria-pressed={on}
      aria-label={on ? "Remove from saved jobs" : "Save this job"}
      title={on ? "Saved" : "Save for later"}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${on ? "border-gold bg-gold text-poster" : "border-[#3d3332] text-ink-soft hover:border-[#6a5a55] hover:text-ink"} ${className}`}
    >
      <Icon name="bookmark" size={16} className={on ? "fill-current" : ""} />
    </button>
  );
}

const applicantsLabel = (job) => (job.openings > 1 ? `${job.applicants} for ${job.openings} openings` : plural(job.applicants, "applicant"));

// A job on the board. "stacked" is for narrow slots (two to a row): a smaller poster beside the title,
// the details full width underneath.
export function Reel({ job, n = 1, stacked = false }) {
  const tilt = n % 2 ? -2 : 2;
  const lift = useLift();
  // Demo data is marked once: a stamp on the big poster, or a badge where the poster is too small to carry one.
  const description = <p className="line-clamp-2 text-ink-soft">{job.description}</p>;
  const head = (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted">
        {job.client.name}, {timeAgo(job.createdAt)}
      </p>
      <h3 className={`mt-1 font-semibold leading-snug text-ink ${stacked ? "text-xl" : "text-2xl"}`}>
        <Link to={`/jobs/${job.id}`} className="hover:text-gold">
          {job.title}
        </Link>
      </h3>
      {stacked && <div className="mt-2 hidden sm:block">{description}</div>}
    </div>
  );
  const body = (
    <>
      {stacked ? <div className="sm:hidden">{description}</div> : description}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Spec label="Budget">{usdc(job.total)}</Spec>
        <Spec label="Applicants">{applicantsLabel(job)}</Spec>
        {job.closesAt && <Spec label="Applications">{closesIn(job.closesAt)}</Spec>}
        {job.duration && <Spec label="Duration">{job.duration}</Spec>}
        {job.level && <Spec label="Level">{job.level}</Spec>}
      </dl>
      {job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 4).map((s) => (
            <SkillChip key={s}>{s}</SkillChip>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center gap-3 pt-1">
        <Button to={`/jobs/${job.id}`} size="sm" className="!min-h-10 !px-4">
          View job
        </Button>
        {stacked && job.demo && <Badge tone="red">Demo</Badge>}
        {/* in the narrow two-up card the bookmark sits with the actions, so the title gets the full width */}
        {stacked && <SaveButton jobId={job.id} className="ml-auto" />}
      </div>
    </>
  );

  if (stacked)
    return (
      <m.article {...lift} className="relative flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-start gap-5">
          <Hang tilt={tilt}>
            <Poster genre={job.category} small />
          </Hang>
          {head}
        </div>
        {body}
      </m.article>
    );

  return (
    <m.article {...lift} className="relative flex flex-col gap-6 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:p-6">
      <Hang tilt={tilt} className="w-full max-w-[11rem] self-start sm:w-40">
        <Poster genre={job.category} demo={job.demo} className="!max-w-none" />
      </Hang>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-start gap-4">
          {head}
          <SaveButton jobId={job.id} />
        </div>
        {body}
      </div>
    </m.article>
  );
}

// The last slot on the board: an invitation to post.
export function ComingSoon() {
  const lift = useLift();
  return (
    <m.article {...lift} className="flex h-full flex-col items-start justify-center gap-4 rounded-xl border border-dashed border-[#3d3332] p-6">
      <Hang tilt={-2}>
        <div
          aria-hidden="true"
          className="poster-title flex aspect-[3/4] w-20 items-center justify-center border border-white/10 text-4xl text-white/30"
          style={{ background: "repeating-linear-gradient(135deg, #201a19 0 8px, #191414 8px 16px)" }}
        >
          ?
        </div>
      </Hang>
      <h3 className="text-xl font-semibold text-ink">Your job could be next</h3>
      <p className="max-w-sm text-ink-soft">Split the budget into milestones. The money waits in escrow until you approve each one.</p>
      <Button to="/jobs/new" variant="secondary" size="sm" className="!min-h-10 !px-4">
        Post a job
      </Button>
    </m.article>
  );
}

// Heading above a home-page list: the poster word, an optional note, and an optional way to see everything.
export function BillHeader({ title, note, id, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h2 id={id} className="poster-title text-4xl text-ink sm:text-5xl">
          {title}
        </h2>
        {note && <p className="mt-2 text-ink-soft">{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function HouseRules() {
  return (
    <section aria-labelledby="rules-title">
      <h2 id="rules-title" className="text-xl font-semibold text-ink">
        How the money works
      </h2>
      <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {houseRules.map(([k, v]) => (
          <div key={k} className="border-t border-gold/40 pt-4">
            <dt className="font-semibold text-ink">{k}</dt>
            <dd className="mt-1 text-sm text-ink-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
