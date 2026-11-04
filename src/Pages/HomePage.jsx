import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { api } from "../lib/api";
import { castDefaults, chipOptions, filterCast } from "../lib/cast";
import { useLift } from "../lib/useLift";
import DeveloperCard from "../Components/DeveloperCard";
import Carousel from "../Components/Carousel";
import CastFilters from "../Components/CastFilters";
import FilterChips from "../Components/FilterChips";
import Hero from "../Components/Hero";
import { HireScene, PayScene, PostScene } from "../Components/ActsScenes";
import EscrowDemo from "../Components/EscrowDemo";
import Testimonial from "../Components/Testimonial";
import { BillHeader, ComingSoon, Hang, HouseRules, Reel } from "../Components/cinema";
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

// One step: a numeral card that straightens when the step is pointed at, a picture of the step, and the way in.
function Act({ a, i, last }) {
  const lift = useLift();
  const Scene = [PostScene, HireScene, PayScene][i];
  return (
    <m.li {...lift} className="relative flex">
      <div className="flex w-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-[#4a3d38]">
        <div className="flex items-center gap-4">
          <Hang tilt={i % 2 ? 2 : -2} className="shrink-0">
            <span
              aria-hidden="true"
              className="poster-title flex h-16 w-14 items-center justify-center border-[3px] border-poster bg-gold text-3xl text-poster shadow-[0_12px_24px_-10px_rgb(0_0_0/0.8)]"
            >
              {a.numeral}
            </span>
          </Hang>
          <h3 className="text-xl font-semibold leading-snug text-ink">
            <span className="sr-only">Step {i + 1}: </span>
            {a.title}
          </h3>
        </div>
        <p className="mt-4 text-ink-soft">{a.text}</p>
        <div className="mt-5">
          <Scene />
        </div>
        <Link to={a.to} className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-5 font-medium text-gold hover:underline">
          {a.cta}
          <Icon name="arrow" size={15} />
        </Link>
      </div>
      {/* the arrow to the next step */}
      {!last && (
        <span aria-hidden="true" className="absolute -right-[1.35rem] top-8 z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-paper text-gold md:flex">
          <Icon name="arrow" size={16} />
        </span>
      )}
    </m.li>
  );
}

const faq = [
  ["Do I need a crypto wallet?", "Only to move money. You can browse, post, apply and message with just an email account. To fund a milestone, be hired or withdraw, link a wallet such as MetaMask or Phantom."],
  ["What stops a client from not paying?", "The money is in escrow before any work starts. After you deliver, the client has 7 days to approve or ask for changes; if they say nothing, you can claim the payment yourself."],
  ["What if the developer never delivers?", "If a funded milestone gets no delivery for 14 days, the client can take the money back from the job page."],
  ["What does it cost?", "Posting and applying are free. A 2% fee comes out of the developer's share when a milestone is paid, and nothing else."],
  ["What happens in a dispute?", "Either side can open one with a reason. The money stays frozen until the arbiter splits it, and if nobody rules within 30 days it is split evenly."],
];

function SeeAll({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-gold hover:underline">
      {children}
      <Icon name="arrow" size={15} />
    </Link>
  );
}

function RowSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} className={`h-80 ${i > 1 ? "hidden lg:block" : ""}`} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { user, openLogin } = useAuth();
  const [developers, setDevelopers] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [kind, setKind] = useState("all");
  const [cast, setCast] = useState(castDefaults);

  useEffect(() => {
    const ctl = new AbortController();
    api("/api/developers", { signal: ctl.signal })
      .then(setDevelopers)
      .catch((e) => e.name !== "AbortError" && setDevelopers([]));
    api("/api/reviews/recent", { signal: ctl.signal })
      .then(setReviews)
      .catch(() => {});
    api("/api/jobs?status=open&limit=50", { signal: ctl.signal })
      .then(setJobs)
      .catch((e) => e.name !== "AbortError" && setJobs([]));
    return () => ctl.abort();
  }, []);

  const kinds = useMemo(() => (jobs ? chipOptions(jobs, (j) => (j.category ? [j.category] : []), "All jobs") : []), [jobs]);
  const shownJobs = useMemo(() => (jobs || []).filter((j) => kind === "all" || j.category === kind), [jobs, kind]);
  const shownCast = useMemo(() => (developers ? filterCast(developers, cast) : []), [developers, cast]);

  return (
    <>
      <Hero devCount={developers?.length} jobCount={jobs?.length} />

      <Section aria-labelledby="bill-title">
        <BillHeader id="bill-title" title="Now showing" note="Open jobs, newest first." action={jobs?.length > 0 && <SeeAll to="/jobs">See all jobs</SeeAll>} />
        {kinds.length > 2 && <FilterChips label="Kind of work" options={kinds} value={kind} onChange={setKind} className="mt-6" />}
        <div className="mt-5">
          {jobs === null && <RowSkeleton />}
          {jobs && (
            <Carousel label="Open jobs" rows={2} resetKey={kind}>
              {[...shownJobs.slice(0, 12).map((j, i) => <Reel key={j.id} job={j} n={i + 1} stacked />), <ComingSoon key="soon" />]}
            </Carousel>
          )}
        </div>
      </Section>

      <Section aria-labelledby="acts-title">
        <BillHeader id="acts-title" title="In three acts" note="From posting a job to paying for it." />
        <ol className="mt-10 grid gap-x-10 gap-y-5 md:grid-cols-3">
          {acts.map((a, i) => (
            <Act key={a.numeral} a={a} i={i} last={i === acts.length - 1} />
          ))}
        </ol>
      </Section>

      <Section aria-labelledby="money-title">
        <BillHeader id="money-title" title="Follow the money" note="One milestone, from the client's wallet, through escrow, to the developer's." />
        <div className="mt-8">
          <EscrowDemo />
        </div>
      </Section>

      <Section aria-labelledby="cast-title">
        <BillHeader
          id="cast-title"
          title="The cast"
          note="Developers available for hire."
          action={developers?.length > 0 && <SeeAll to="/developers">See all developers</SeeAll>}
        />
        {developers?.length > 0 && (
          <div className="mt-6">
            <CastFilters devs={developers} value={cast} onChange={setCast} idPrefix="home-cast" />
          </div>
        )}
        <div className="mt-5">
          {developers === null && <RowSkeleton />}
          {shownCast.length > 0 && (
            <Carousel label="Developers" rows={2} resetKey={JSON.stringify(cast)}>
              {shownCast.slice(0, 12).map((d, i) => (
                <DeveloperCard key={d.id} dev={d} n={i + 1} isMine={user?.id === d.userId} />
              ))}
            </Carousel>
          )}
          {developers?.length > 0 && shownCast.length === 0 && (
            <EmptyState
              icon="user"
              title="Nobody matches these filters"
              action={
                <Button variant="secondary" onClick={() => setCast(castDefaults)}>
                  Clear filters
                </Button>
              }
            >
              Try a wider rate, fewer stars or another speciality.
            </EmptyState>
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

      <Section aria-labelledby="faq-title">
        <BillHeader id="faq-title" title="Questions" note="What people ask before their first job." action={<SeeAll to="/help">All answers</SeeAll>} />
        <div className="mt-8 divide-y divide-line rounded-xl border border-line">
          {faq.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <Icon name="plus" size={18} className="shrink-0 text-gold transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="max-w-[68ch] px-5 pb-5 text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
