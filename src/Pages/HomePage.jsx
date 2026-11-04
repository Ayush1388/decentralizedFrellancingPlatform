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

// Headlines may speak theatre; everything people read to decide or click says it plainly.
const acts = [
  {
    numeral: "I",
    title: "Post the job",
    text: "Describe the work, pick the skills you need and split the budget into milestones.",
    to: "/jobs/new",
    cta: "Post a job",
  },
  {
    numeral: "II",
    title: "Hire a developer",
    text: "Developers apply with a quote. Compare them, message them, then hire one.",
    to: "/developers",
    cta: "Browse developers",
  },
  {
    numeral: "III",
    title: "Pay per milestone",
    text: "Fund each milestone into escrow. It is paid out only when you approve the work.",
    to: "/help",
    cta: "How escrow works",
  },
];

// The hero is an admission ticket, and the two ways in are printed on it.
function Ticket({ devCount, jobCount }) {
  const serial = String(1000 + (devCount ?? 0)).padStart(6, "0");
  const facts = [
    ["Open jobs", jobCount ?? "–"],
    ["Developers", devCount ?? "–"],
    ["Fee", "2% on payouts"],
  ];
  return (
    <div className="rise relative mx-auto flex max-w-4xl flex-col overflow-hidden bg-ticket text-poster shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)] sm:flex-row">
      {/* notches where the ticket would be torn */}
      <span aria-hidden="true" className="absolute -top-4 left-[calc(100%-11.5rem)] hidden h-8 w-8 rounded-full bg-paper sm:block" />
      <span aria-hidden="true" className="absolute -bottom-4 left-[calc(100%-11.5rem)] hidden h-8 w-8 rounded-full bg-paper sm:block" />

      <div className="flex-1 p-6 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">The Blockchain Picture House presents</p>
        <h1 className="poster-title mt-4 text-[3.2rem] !leading-[0.95] sm:text-7xl lg:text-[5.2rem]">Hire developers. Pay on delivery.</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed">
          Split the work into milestones. Your USDC waits in escrow and goes to the developer only when you approve.
        </p>

        <dl className="mt-7 grid grid-cols-3 gap-4 border-y-2 border-dashed border-poster/25 py-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm opacity-70">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 flex flex-wrap gap-3">
          <Button to="/jobs/new" variant="dark" className="min-h-12">
            Post a job
          </Button>
          <Button to="/jobs" variant="light" className="min-h-12">
            Find work
          </Button>
        </div>
      </div>

      {/* the stub */}
      <div aria-hidden="true" className="flex items-center justify-between gap-4 border-t-2 border-dashed border-poster/40 bg-gold p-5 sm:w-44 sm:flex-col sm:justify-center sm:border-l-2 sm:border-t-0">
        <p className="poster-title text-3xl sm:rotate-180 sm:text-5xl sm:[writing-mode:vertical-rl]">Admit one</p>
        <div className="text-right text-xs tabular-nums sm:mt-6 sm:text-center">
          <p className="opacity-70">Nº</p>
          <p className="text-base font-semibold">{serial}</p>
          <p className="mt-2 opacity-70">{reelDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
}

function Acts() {
  return (
    <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
      {acts.map((a, i) => (
        <li key={a.numeral} className="flex gap-5 md:flex-col">
          {/* each step is numbered on a small gold card, the only print on this row */}
          <span
            aria-hidden="true"
            className="poster-title flex h-20 w-16 shrink-0 items-center justify-center border-[3px] border-poster bg-gold text-4xl text-poster shadow-[0_12px_24px_-10px_rgb(0_0_0/0.8)]"
            style={{ transform: `rotate(${i % 2 ? 2 : -2}deg)` }}
          >
            {a.numeral}
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {a.title}
            </h3>
            <p className="mt-1.5 text-ink-soft">{a.text}</p>
            <Link to={a.to} className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-medium text-gold hover:underline">
              {a.cta}
              <Icon name="arrow" size={15} />
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SeeAll({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-gold hover:underline">
      {children}
      <Icon name="arrow" size={15} />
    </Link>
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
      {/* Hero: one spotlight, the marquee coming on, and the ticket */}
      <section className="relative px-4 pt-10 sm:pt-14" style={{ background: "radial-gradient(45% 60% at 50% 0%, rgb(242 194 48 / 0.16), transparent 70%)" }}>
        <Bulbs count={36} className="mx-auto mb-5 max-w-4xl px-2" />
        <Ticket devCount={developers?.length} jobCount={jobs?.length} />
      </section>

      <Section aria-labelledby="bill-title">
        <BillHeader id="bill-title" title="Now showing" note="Open jobs, newest first." action={jobs?.length > 0 && <SeeAll to="/jobs">See all jobs</SeeAll>} />
        <div className="mt-8">
          {jobs === null && <CardSkeleton className="h-80" />}
          {jobs && (
            <Carousel label="Open jobs" twoUp>
              {[...jobs.slice(0, 5).map((j, i) => <Reel key={j.id} job={j} n={i + 1} stacked />), <ComingSoon key="soon" />]}
            </Carousel>
          )}
        </div>
      </Section>

      <Section aria-labelledby="acts-title">
        <BillHeader id="acts-title" title="In three acts" note="From posting a job to paying for it." />
        <Acts />
      </Section>

      <Section aria-labelledby="cast-title">
        <BillHeader
          id="cast-title"
          title="The cast"
          note="Developers available for hire."
          action={developers?.length > 0 && <SeeAll to="/developers">See all developers</SeeAll>}
        />
        <div className="mt-8">
          {developers === null && <CardSkeleton className="h-72" />}
          {developers?.length > 0 && (
            <Carousel label="Developers">
              {developers.slice(0, 6).map((d, i) => (
                <DeveloperCard key={d.id} dev={d} n={i + 1} isMine={user?.id === d.userId} />
              ))}
            </Carousel>
          )}
          {developers?.length === 0 && (
            <EmptyState
              icon="user"
              title="No developer profiles yet"
              action={
                <Button onClick={user ? undefined : openLogin} to={user ? "/developers" : undefined}>
                  Create your profile
                </Button>
              }
            >
              List your skills and rate so clients can find you.
            </EmptyState>
          )}
        </div>
      </Section>

      {/* Reviews: only what people actually wrote on the platform. Nothing is shown until there are some. */}
      {reviews.length > 0 && (
        <Section aria-labelledby="reviews-title">
          <BillHeader id="reviews-title" title="The reviews" note="Written after a paid job." />
          <div className={`mt-8 grid gap-4 ${reviews.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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
