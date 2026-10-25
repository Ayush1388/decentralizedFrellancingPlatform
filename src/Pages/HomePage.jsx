import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import DeveloperCard from "../Components/DeveloperCard";
import Testimonial from "../Components/Testimonial";
import { testimonials } from "../data/testimonials";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, Icon, IllustrationPanel, Section, SectionHeader } from "../Components/ui";
import { useAuth } from "../context/useAuth";

const proof = [
  { icon: "coins", title: "Paid in USDC", text: "Stable value, no volatility" },
  { icon: "lock", title: "Escrow per milestone", text: "Funded before work starts" },
  { icon: "clock", title: "7-day auto-release", text: "Silent client? Developer claims" },
  { icon: "shield", title: "2% fee on release", text: "Nothing to post or apply" },
];

const steps = [
  {
    title: "Post your project",
    text: "Tell us what you need. Write a short project description, select the skills required and set your budget in USDC, split into milestones.",
    img: "/Work time-cuate.svg",
  },
  {
    title: "Hire the right developer",
    text: "Browse verified Web3 developers, check their profiles, past work and reviews. Chat with them before you commit to the perfect match.",
    img: "/Hired-cuate.svg",
  },
  {
    title: "Pay securely in USDC",
    text: "Work with confidence. Funds are held in escrow and released only when you approve each milestone.",
    img: "/Freelancer-cuate.svg",
  },
];

const rules = [
  { big: "100%", title: "Locked in escrow", text: "Each milestone is funded before work starts and held until you approve it." },
  { big: "7 days", title: "Auto-release", text: "Client silent after delivery? The developer can claim the milestone." },
  { big: "14 days", title: "Refund window", text: "Nothing delivered? Reclaim your funded milestone yourself." },
  { big: "2%", title: "Fee on release only", text: "It comes out of a payout, never on top of what you pay." },
];


const tones = { gray: "gray", green: "green", blue: "blue", amber: "amber" };

function Row({ title, sub, badge, tone, live, children }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-300 ${live ? "bg-green-100 ring-1 ring-green-300" : "bg-surface"}`}>
      {children}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      {badge && <Badge tone={tones[tone]}>{badge}</Badge>}
    </li>
  );
}

// Looping example of one milestone moving through escrow. Holds the final frame under reduced motion.
const frames = [
  { label: "Funded", tone: "blue", note: "Client locked $900 in escrow" },
  { label: "In review", tone: "amber", note: "Developer submitted the work" },
  { label: "Released", tone: "green", note: "Client approved, payout sent" },
];

function StepCard({ step }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (step !== 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(frames.length - 1);
      return;
    }
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 2400);
    return () => clearInterval(t);
  }, [step]);

  const head = (label, right) => (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-semibold">{label}</p>
      <span className="text-xs text-muted">{right}</span>
    </div>
  );

  if (step === 0)
    return (
      <>
        {head("Job posted", "Example · $1,800")}
        <ul className="space-y-2">
          <Row title="Design system" sub="$400" badge="Not funded" tone="gray" />
          <Row title="Wallet integration" sub="$900" badge="Not funded" tone="gray" />
          <Row title="Launch & handover" sub="$500" badge="Not funded" tone="gray" />
        </ul>
      </>
    );
  if (step === 1)
    return (
      <>
        {head("Applications", "Example · 3 new")}
        <ul className="space-y-2">
          {[
            ["Priya N.", "Frontend engineer · $70/hr", 0],
            ["Michael C.", "Smart contract auditor · $95/hr", 1],
            ["Ayush P.", "Full-stack Web3 · $60/hr", 0],
          ].map(([n, s, seed]) => (
            <Row key={n} title={n} sub={s} badge={n === "Priya N." ? "Hire" : undefined} tone="green">
              <Avatar seed={seed} size={32} />
            </Row>
          ))}
        </ul>
      </>
    );
  const f = frames[i];
  return (
    <>
      {head("Escrow", "Example · $1,800")}
      <ul className="space-y-2">
        <Row title="Design system" sub="$400" badge="Released" tone="green" />
        <Row title="Wallet integration" sub={f.note} badge={f.label} tone={f.tone} live />
        <Row title="Launch & handover" sub="$500" badge="Not funded" tone="gray" />
      </ul>
    </>
  );
}

function HowItWorks() {
  const [active, setActive] = useState(0);
  return (
    <div className="mt-16 grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div role="tablist" aria-label="How it works" className="space-y-3">
        {steps.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.title}
              role="tab"
              id={`step-tab-${i}`}
              aria-selected={on}
              aria-controls="step-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") setActive((active + 1) % steps.length);
                if (e.key === "ArrowUp" || e.key === "ArrowLeft") setActive((active + steps.length - 1) % steps.length);
              }}
              className={`card flex w-full gap-4 p-5 text-left transition-all duration-300 sm:p-6 ${on ? "!border-green-800 !bg-white" : "hover:border-green-700"}`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-serif text-xl transition-colors duration-300 ${on ? "border-green-900 bg-green-900 text-paper" : "border-green-300 text-green-800"}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-3xl leading-tight">{s.title}</span>
                <span className={`grid transition-all duration-300 ${on ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <span className="overflow-hidden text-muted">{s.text}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className="space-y-4">
        <IllustrationPanel key={steps[active].img} src={steps[active].img} className="rise aspect-[16/10]" />
        <div className="card p-5">
          <StepCard step={active} />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, openLogin } = useAuth();
  const [developers, setDevelopers] = useState(null);

  useEffect(() => {
    const ctl = new AbortController();
    api("/api/developers", { signal: ctl.signal })
      .then((d) => setDevelopers(d.slice(0, 6)))
      .catch((e) => e.name !== "AbortError" && setDevelopers([]));
    return () => ctl.abort();
  }, []);

  return (
    <>
      {/* Hero: dark forest ground, serif promise bottom-left, hairline CTA bottom-right */}
      <section
        className="relative isolate overflow-hidden bg-green-950 text-white"
        style={{
          backgroundImage:
            "radial-gradient(55% 60% at 74% 38%, rgb(224 178 112 / 0.22), transparent 70%), radial-gradient(40% 50% at 12% 0%, rgb(61 113 86 / 0.35), transparent 70%), linear-gradient(180deg, #0b2a1e 0%, #04120d 78%)",
        }}
      >
        <div className="container-page relative grid min-h-[min(46rem,calc(100svh-4rem))] items-end gap-10 pb-10 pt-14 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
          <div className="rise self-end">
            <p className="eyebrow mb-8 flex items-center gap-3 text-white/70">
              <img src="/eth.jpeg" alt="" width="16" height="16" className="h-4 w-4 rounded-full opacity-90" /> Built on Ethereum · Paid in USDC
            </p>
            <h1 className="text-[3.1rem] sm:text-7xl lg:text-[5.6rem]">
              Hire developers.
              <span className="block text-white/80">Pay on delivery.</span>
            </h1>
            <div className="mt-10 flex flex-wrap items-end justify-between gap-6">
              <p className="eyebrow max-w-xs !leading-[1.9] text-white/70">
                Funds wait in escrow and release only when you approve each milestone
              </p>
              <div className="flex flex-wrap gap-3">
                <Button to="/developers" variant="light">
                  Hire now
                </Button>
                <Button to="/jobs" variant="light" className="!border-white/30">
                  Find work
                </Button>
              </div>
            </div>
          </div>

          <div className="rise relative mx-auto hidden w-full max-w-sm self-center lg:block">
            <div className="arch aspect-[3/4] overflow-hidden bg-paper p-6 pt-24 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
              <img src="/Working remotely-bro.png" alt="A developer working remotely at a laptop" className="h-full w-full object-contain" />
            </div>
          </div>
        </div>

        <ul className="container-page relative grid border-t border-white/15 sm:grid-cols-2 lg:grid-cols-4">
          {proof.map((p, i) => (
            <li key={p.title} className={`flex items-start gap-4 py-6 lg:px-6 ${i ? "lg:border-l lg:border-white/15" : "lg:pl-0"}`}>
              <Icon name={p.icon} size={18} className="mt-1 text-white/60" />
              <span>
                <span className="eyebrow block !text-[0.68rem] text-white">{p.title}</span>
                <span className="mt-1 block text-sm text-white/60">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Developers */}
      <Section aria-labelledby="devs-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader align="left" eyebrow="Talent" id="devs-title" title="Developers" subtitle="Hire people with proven, escrow-backed work." />
          <Link to="/developers" className="eyebrow inline-flex items-center gap-2 border-b border-green-700 pb-1 text-green-800 hover:text-green-950">
            View all <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {developers === null && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
          {developers?.map((d) => <DeveloperCard key={d.id} dev={d} isMine={user?.id === d.userId} />)}
        </div>
        {developers?.length === 0 && (
          <EmptyState
            image="/Working-bro.png"
            title="No developer profiles yet"
            action={
              <Button onClick={user ? undefined : openLogin} to={user ? "/developers" : undefined}>
                Be the first to list your skills
              </Button>
            }
          >
            Create a profile and start getting hired.
          </EmptyState>
        )}
      </Section>

      {/* How it works */}
      <Section aria-labelledby="how-title">
        <SectionHeader eyebrow="How it works" id="how-title" title="From brief to payout in three steps" subtitle="Pick a step to see what each side sees." />
        <HowItWorks />
      </Section>

      {/* Rules */}
      <Section aria-labelledby="rules-title">
        <div className="grid items-center gap-10 rounded-sm bg-surface p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:p-14">
          <div>
            <SectionHeader
              align="left"
              eyebrow="The rules, up front"
              id="rules-title"
              title="Built so nobody has to trust anybody"
              subtitle="Disagree about the work? Either side can open a dispute. The milestone freezes and a neutral arbiter splits the funds."
            />
            <IllustrationPanel src="/Co-workers-cuate.svg" className="mt-8 hidden aspect-[16/10] !bg-paper lg:flex" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map((r) => (
              <div key={r.title} className="card p-6">
                <p className="font-serif text-6xl leading-none text-green-800">{r.big}</p>
                <h3 className="eyebrow mt-4 text-ink">{r.title}</h3>
                <p className="mt-1 text-sm text-muted">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Testimonials */}
      <Section aria-labelledby="t-title">
        <SectionHeader eyebrow="Testimonial" id="t-title" title="Trusted by founders, startups and Web3 teams worldwide" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Testimonial key={t.name} seed={i} {...t} />
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section>
        <div
          className="grid items-center gap-10 overflow-hidden rounded-sm bg-green-950 p-8 text-white sm:p-12 md:grid-cols-[1.2fr_1fr] lg:p-16"
          style={{ backgroundImage: "radial-gradient(60% 80% at 90% 20%, rgb(224 178 112 / 0.18), transparent 70%)" }}
        >
          <div>
            <p className="eyebrow mb-5 text-white/60">Start today</p>
            <h2 className="text-5xl sm:text-6xl">Ready to build something?</h2>
            <p className="mt-5 max-w-md text-white/70">Post a job in minutes. You only pay when you approve the work.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button to="/jobs/new" variant="solidLight">
                Post a job
              </Button>
              <Button to="/developers" variant="light">
                Browse developers
              </Button>
            </div>
          </div>
          <div className="arch hidden aspect-[4/3] max-w-xs justify-self-end bg-paper p-6 pt-14 md:block">
            <img src="/Business growth-rafiki.svg" alt="" className="h-full w-full object-contain" />
          </div>
        </div>
      </Section>
    </>
  );
}
