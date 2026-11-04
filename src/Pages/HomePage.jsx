import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import DeveloperCard from "../Components/DeveloperCard";
import Carousel from "../Components/Carousel";
import Testimonial from "../Components/Testimonial";
import { BillHeader, Bulbs, ComingSoon, HouseRules, Reel } from "../Components/cinema";
import { reelDate } from "../lib/cinema";
import { Button, CardSkeleton, EmptyState, Icon, Section } from "../Components/ui";
import { useAuth } from "../context/useAuth";

const acts = [
  {
    act: "Act I", numeral: "I",
    title: "The pitch",
    text: "Describe the project, pick the skills you need and split a USDC budget into milestones.",
    to: "/jobs/new",
    cta: "Post a job",
  },
  {
    act: "Act II", numeral: "II",
    title: "The casting",
    text: "Developers apply. Compare profiles and rates, chat with them, then hire one.",
    to: "/developers",
    cta: "Meet the cast",
  },
  {
    act: "Act III", numeral: "III",
    title: "The payoff",
    text: "Fund each milestone into escrow. It is released only when you approve the work.",
    to: "/wallet",
    cta: "Open box office",
  },
];

// An admission ticket: the hero, with the two ways in as its options.
function Ticket({ devCount }) {
  const serial = String(1000 + (devCount ?? 0)).padStart(6, "0");
  return (
    <div className="rise relative mx-auto flex max-w-4xl flex-col overflow-hidden bg-ticket text-poster shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)] sm:flex-row">
      {/* notches where the ticket would be torn */}
      <span aria-hidden="true" className="absolute -top-4 left-[calc(100%-11.5rem)] hidden h-8 w-8 rounded-full bg-paper sm:block" />
      <span aria-hidden="true" className="absolute -bottom-4 left-[calc(100%-11.5rem)] hidden h-8 w-8 rounded-full bg-paper sm:block" />

      <div className="flex-1 p-6 sm:p-10">
        <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>The Blockchain Picture House</span>
          <span aria-hidden="true">·</span>
          <span>presents</span>
        </p>
        <h1 className="poster-title mt-4 text-[3.4rem] sm:text-7xl lg:text-[5.4rem]">
          Hire developers.
          <span className="block text-[#8a6a10]">Pay on delivery.</span>
        </h1>
        <p className="mt-4 font-serif text-xl italic">A feature in milestones, with the money held in escrow.</p>

        <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-dashed border-poster/30 py-4 font-mono text-[0.8rem]">
          <div>
            <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] opacity-70">Screen</dt>
            <dd className="font-bold">Ethereum</dd>
          </div>
          <div>
            <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] opacity-70">Tender</dt>
            <dd className="font-bold">USDC</dd>
          </div>
          <div>
            <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] opacity-70">Fee</dt>
            <dd className="font-bold">2% on release</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/developers" className="inline-flex min-h-12 items-center gap-2 bg-poster px-5 text-[0.75rem] font-semibold uppercase tracking-[0.2em] text-ticket hover:bg-black">
            I'm hiring <Icon name="arrow" size={15} />
          </Link>
          <Link to="/jobs" className="inline-flex min-h-12 items-center gap-2 border-2 border-poster px-5 text-[0.75rem] font-semibold uppercase tracking-[0.2em] hover:bg-poster/5">
            I want work
          </Link>
        </div>
      </div>

      {/* the stub */}
      <div className="flex items-center justify-between gap-4 border-t-2 border-dashed border-poster/40 bg-gold p-5 sm:w-44 sm:flex-col sm:justify-center sm:border-l-2 sm:border-t-0">
        <p className="poster-title text-3xl sm:rotate-180 sm:text-5xl sm:[writing-mode:vertical-rl]">Admit one</p>
        <div className="text-right font-mono text-[0.72rem] sm:mt-6 sm:text-center">
          <p className="opacity-70">Nº</p>
          <p className="text-base font-bold">{serial}</p>
          <p className="mt-2 opacity-70">{reelDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
}

// Strip of film with live numbers in the frames; drifts sideways, pauses on hover.
function FilmStrip({ devCount, jobCount }) {
  const frames = [
    ["In the cast", devCount ?? "—", "developers"],
    ["On the bill", jobCount ?? "—", "open jobs"],
    ["Intermission", "7", "days to auto-release"],
    ["Refunds", "14", "days if nothing lands"],
    ["Concessions", "2%", "only on release"],
    ["Tender", "USDC", "on Ethereum"],
  ];
  const holes = (
    <div aria-hidden="true" className="flex h-5 items-center gap-4 overflow-hidden px-2">
      {Array.from({ length: 80 }).map((_, i) => (
        <span key={i} className="h-2.5 w-4 shrink-0 rounded-[2px] bg-paper" />
      ))}
    </div>
  );
  const row = (hidden) =>
    frames.map(([k, v, unit]) => (
      <li key={k + hidden} aria-hidden={hidden || undefined} className="w-56 shrink-0 border-x border-black/60 bg-[#191716] px-5 py-4">
        <p className="eyebrow text-gold">{k}</p>
        <p className="poster-title mt-2 text-5xl text-ink">{v}</p>
        <p className="font-mono text-[0.75rem] text-muted">{unit}</p>
      </li>
    ));
  return (
    // The wrapper clips the tilted strip so the page never scrolls sideways.
    <div className="mt-16 overflow-x-clip py-4">
      <section aria-label="Tonight in numbers" className="filmstrip -mx-4 -rotate-1 overflow-hidden bg-[#050505] py-1">
      {holes}
      <ul className="filmstrip-track flex w-max">
        {row(false)}
        {row(true)}
      </ul>
      {holes}
      </section>
    </div>
  );
}

function Acts() {
  return (
    <ol className="mt-8 grid gap-6 md:grid-cols-3">
      {acts.map((a, i) => (
        <li key={a.act} className="flex flex-col border border-white/10 bg-surface p-4 sm:p-5">
          {/* A tilted gold one-sheet, like the posters on the programme */}
          <div
            className="relative flex aspect-[4/3] w-full flex-col justify-between overflow-hidden border-[3px] border-poster bg-gold p-3 text-poster shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]"
            style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}
            aria-hidden="true"
          >
            <p className="text-[0.5rem] font-semibold uppercase tracking-[0.14em]">The Blockchain Picture Company presents</p>
            <p className="poster-title text-center text-[5.5rem] leading-none">{a.numeral}</p>
            <p className="text-center font-serif text-sm italic">{a.title}</p>
          </div>
          <p className="mt-6 font-mono text-[0.8rem] text-gold">{a.act}</p>
          <h3 className="poster-title mt-2 text-4xl">{a.title}</h3>
          <p className="mt-2 flex-1 text-ink-soft">{a.text}</p>
          <Link to={a.to} className="eyebrow mt-5 inline-flex min-h-11 items-center gap-2 self-start text-gold hover:underline">
            {a.cta} <Icon name="arrow" size={14} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function HomePage() {
  const { user, openLogin } = useAuth();
  const [developers, setDevelopers] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    const ctl = new AbortController();
    api("/api/developers", { signal: ctl.signal })
      .then(setDevelopers)
      .catch((e) => e.name !== "AbortError" && setDevelopers([]));
    api("/api/reviews/recent", { signal: ctl.signal })
      .then(setReviews)
      .catch(() => {});
    api("/api/jobs?status=open", { signal: ctl.signal })
      .then(setJobs)
      .catch((e) => e.name !== "AbortError" && setJobs([]));
    return () => ctl.abort();
  }, []);

  return (
    <>
      {/* Hero: spotlight on a ticket */}
      <section
        className="relative px-4 pt-10"
        style={{ background: "radial-gradient(45% 60% at 50% 0%, rgb(242 194 48 / 0.18), transparent 70%)" }}
      >
        <p className="eyebrow mb-4 text-center text-gold">Tonight's feature</p>
        <Bulbs count={36} className="mx-auto mb-5 max-w-4xl px-2" />
        <Ticket devCount={developers?.length} />
        <p className="relative mx-auto mt-3 max-w-4xl -rotate-3 text-right font-hand text-base text-marker sm:text-xl">No payment until you approve it!</p>
      </section>

      <FilmStrip devCount={developers?.length} jobCount={jobs?.length} />

      {/* On the bill: open jobs as reels */}
      <Section aria-labelledby="bill-title">
        <BillHeader id="bill-title" title="On the bill" note="open jobs, dated like reels in a can · newest first" />
        <div className="mt-5">
          {jobs === null && <div className="h-72 animate-pulse bg-surface" />}
          {jobs && (
            <Carousel label="Open jobs" twoUp>
              {[
                ...jobs.slice(0, 5).map((j, i) => <Reel key={j.id} job={j} n={i + 1} />),
                <ComingSoon key="soon" n={Math.min(jobs.length, 5) + 1} />,
              ]}
            </Carousel>
          )}
        </div>
        {jobs?.length > 5 && (
          <div className="mt-6 text-center">
            <Button to="/jobs" variant="secondary">
              See the full programme
            </Button>
          </div>
        )}
      </Section>

      {/* How it works */}
      <Section aria-labelledby="acts-title">
        <BillHeader id="acts-title" title="In three acts" note="from the pitch to the payoff" />
        <Acts />
      </Section>

      {/* The cast */}
      <Section aria-labelledby="cast-title">
        <BillHeader id="cast-title" title="The cast" note="developers available for hire" />
        <div className="mt-6">
          {developers === null && <CardSkeleton className="h-72" />}
          {developers?.length > 0 && (
            <Carousel label="Developers">
              {developers.slice(0, 6).map((d, i) => (
                <DeveloperCard key={d.id} dev={d} n={i + 1} isMine={user?.id === d.userId} />
              ))}
            </Carousel>
          )}
        </div>
        {developers?.length === 0 && (
          <EmptyState
            image="/Working-bro.png"
            title="Casting call open"
            action={
              <Button onClick={user ? undefined : openLogin} to={user ? "/developers" : undefined}>
                Audition: list your skills
              </Button>
            }
          >
            No developer profiles yet. Be the first on the poster.
          </EmptyState>
        )}
        {developers?.length > 0 && (
          <div className="mt-6 text-center">
            <Button to="/developers" variant="secondary">
              Full cast list
            </Button>
          </div>
        )}
      </Section>

      {/* Reviews: only what people actually wrote on the platform. Nothing is shown until there are some. */}
      {reviews.length > 0 && (
        <Section aria-labelledby="reviews-title">
          <BillHeader id="reviews-title" title="The reviews" note="written by people after a paid job" />
          <div className={`mt-6 grid gap-4 ${reviews.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {reviews.slice(0, 3).map((r, i) => (
              <Testimonial key={i} seed={i} name={r.reviewer} role={r.role} jobTitle={r.jobTitle} quote={r.comment} rating={r.rating} demo={r.demo} />
            ))}
          </div>
        </Section>
      )}

      <Section>
        <HouseRules />
      </Section>
    </>
  );
}
