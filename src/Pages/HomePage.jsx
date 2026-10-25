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
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-300 ${live ? "bg-green-50 ring-1 ring-green-200" : "bg-surface"}`}>
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
    <div className="mt-14 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
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
              className={`card flex w-full gap-4 p-5 text-left transition-all duration-300 sm:p-6 ${on ? "!border-green-700 shadow-lg ring-1 ring-green-700/20" : "hover:border-green-300"}`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 ${on ? "bg-green-700 text-white" : "bg-green-100 text-green-900"}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold tracking-tight">{s.title}</span>
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
      {/* Hero */}
      <section className="bg-gradient-to-b from-green-50 to-white">
        <div className="container-page grid items-center gap-12 py-14 md:grid-cols-2 md:py-24">
          <div className="rise">
            <Badge tone="green" className="mb-6 !px-3.5 !py-1">
              <img src="/eth.jpeg" alt="" width="14" height="14" className="h-3.5 w-3.5 rounded-full" /> Built on Ethereum · Paid in USDC
            </Badge>
            <h1 className="text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[3.9rem]">
              Hire Developers,
              <span className="block text-green-700">Pay in Crypto</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              A global freelancing platform built for the future. Find developers, manage projects, and make borderless payments that stay in escrow until the
              work is done.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button to="/developers" className="!min-h-12 !px-8 text-base">
                Hire now <Icon name="arrow" size={18} />
              </Button>
              <Button to="/jobs" variant="secondary" className="!min-h-12 !px-8 text-base">
                Find work
              </Button>
            </div>
          </div>
          <IllustrationPanel
            src="/Working remotely-bro.png"
            alt="A developer working remotely at a laptop"
            className="rise mx-auto aspect-square w-full max-w-lg !bg-white shadow-[0_20px_60px_-24px_rgb(22_163_74/0.35)] ring-1 ring-green-100 md:ml-auto"
            imgClass="!p-0 scale-105"
          />
        </div>
      </section>

      {/* Proof strip */}
      <div className="container-page">
        <ul className="card grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {proof.map((p) => (
            <li key={p.title} className="flex items-center gap-3 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-800">
                <Icon name={p.icon} size={20} />
              </span>
              <span>
                <span className="block font-semibold leading-tight">{p.title}</span>
                <span className="text-sm text-muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Developers */}
      <Section aria-labelledby="devs-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader align="left" eyebrow="Talent" id="devs-title" title="Developers" subtitle="Hire people with proven, escrow-backed work." />
          <Link to="/developers" className="inline-flex items-center gap-1 font-semibold text-green-800 hover:underline">
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
        <div className="grid items-center gap-10 rounded-3xl bg-surface p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:p-14">
          <div>
            <SectionHeader
              align="left"
              eyebrow="The rules, up front"
              id="rules-title"
              title="Built so nobody has to trust anybody"
              subtitle="Disagree about the work? Either side can open a dispute. The milestone freezes and a neutral arbiter splits the funds."
            />
            <IllustrationPanel src="/Co-workers-cuate.svg" className="mt-8 hidden aspect-[16/10] !bg-white lg:flex" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map((r) => (
              <div key={r.title} className="card p-6">
                <p className="text-4xl font-bold tracking-tight text-green-700">{r.big}</p>
                <h3 className="mt-3 font-semibold">{r.title}</h3>
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
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-green-700 p-6 text-white sm:p-10 md:grid-cols-[1.1fr_1fr] lg:p-14">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">Ready to build something?</h2>
            <p className="mt-3 max-w-md text-green-50">Post a job in minutes. You only pay when you approve the work.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/jobs/new" className="!bg-white !text-green-900 hover:!bg-green-50">
                Post a job
              </Button>
              <Button to="/developers" variant="ghost" className="!text-white hover:!bg-white/10">
                Browse developers
              </Button>
            </div>
          </div>
          <IllustrationPanel src="/Business growth-rafiki.svg" className="hidden aspect-[4/3] !bg-white md:flex" />
        </div>
      </Section>
    </>
  );
}
