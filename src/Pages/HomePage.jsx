import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import DeveloperCard from "../Components/DeveloperCard";
import Testimonial from "../Components/Testimonial";
import { testimonials } from "../data/testimonials";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, Icon, IconButton, Section, SectionHeader } from "../Components/ui";
import { useAuth } from "../context/useAuth";

const skills = ["Solidity", "React", "Go", "Smart contract audits", "UI design"];

const steps = [
  {
    title: "Post your project",
    text: "Write a short description, pick the skills you need and set a USDC budget split into milestones.",
    img: "/Work time-cuate.svg",
  },
  {
    title: "Hire the right developer",
    text: "Compare profiles, rates and past work. Chat with applicants before you commit.",
    img: "/Hired-cuate.svg",
  },
  {
    title: "Pay securely in USDC",
    text: "Fund each milestone into escrow. It is released only when you approve the work.",
    img: "/Freelancer-cuate.svg",
  },
];

const rules = [
  { big: "100%", title: "Locked in escrow", text: "Each milestone is funded before work starts and held until you approve it.", tint: "bg-blush" },
  { big: "7 days", title: "Auto-release", text: "Client silent after delivery? The developer can claim the milestone.", tint: "bg-sky" },
  { big: "14 days", title: "Refund window", text: "Nothing delivered? Reclaim your funded milestone yourself.", tint: "bg-butter" },
  { big: "2%", title: "Fee on release only", text: "It comes out of a payout, never on top of what you pay.", tint: "bg-white" },
];

// The example job shown in the dark "Escrow" tile and the how-it-works panel.
const example = [
  { title: "Design system", amount: 400, pct: 100, bar: "bg-mint", status: "Released" },
  { title: "Wallet integration", amount: 900, pct: 62, bar: "bg-sky", status: "In escrow" },
  { title: "Launch & handover", amount: 500, pct: 12, bar: "bg-blush", status: "Not funded" },
];

function Stat({ label, value }) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className="stat-value mt-1">{value ?? "—"}</p>
    </div>
  );
}

function Bar({ pct, cls }) {
  return (
    <div className="relative h-8 overflow-hidden rounded-full bg-white/10">
      <div className={`absolute inset-y-0 left-0 rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-end gap-2.5 pr-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-white/30" />
        ))}
      </div>
    </div>
  );
}

function EscrowTile() {
  return (
    <div className="tile flex flex-col bg-ink text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Escrow</p>
          <p className="text-xs text-white/50">Example job</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">$1,800.00</p>
          <p className="text-xs text-green-300">$400 released</p>
        </div>
      </div>
      <div className="my-5 border-t border-dashed border-white/20" />
      <ul className="space-y-4">
        {example.map((m) => (
          <li key={m.title}>
            <div className="mb-1.5 flex justify-between text-xs text-white/70">
              <span>{m.title}</span>
              <span>
                ${m.amount} · {m.status}
              </span>
            </div>
            <Bar pct={m.pct} cls={m.bar} />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <p className="text-sm text-white/60">Each bar is a milestone. You approve before anything moves.</p>
        <IconButton icon="arrowUpRight" label="Post a job" to="/jobs/new" tone="outline" className="text-white" />
      </div>
    </div>
  );
}

function StepPreview({ step }) {
  if (step === 1)
    return (
      <ul className="space-y-2">
        {[
          ["Priya N.", "Frontend engineer · $70/hr", 0, "bg-ink text-white"],
          ["Michael C.", "Smart contract auditor · $95/hr", 1, "bg-white"],
          ["Ayush P.", "Full-stack Web3 · $60/hr", 0, "bg-white/70"],
        ].map(([n, s, seed, cls], i) => (
          <li key={n} className={`flex items-center gap-3 rounded-full p-1.5 pr-5 ${cls}`}>
            <Avatar seed={seed} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{n}</span>
              <span className="block truncate text-xs opacity-70">{s}</span>
            </span>
            {i === 0 && <span className="text-xs font-medium">Hire</span>}
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="space-y-2">
      {example.map((m, i) => (
        <li key={m.title} className={`flex items-center justify-between gap-3 rounded-full px-5 py-3 ${step === 2 && i === 1 ? "bg-ink text-white" : "bg-white"}`}>
          <span className="text-sm font-semibold">{m.title}</span>
          <span className="text-xs opacity-70">
            ${m.amount} · {step === 0 ? "Not funded" : m.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HowItWorks() {
  const [active, setActive] = useState(0);
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <div role="tablist" aria-label="How it works" className="grid gap-4">
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
              className={`tile flex w-full items-start gap-4 text-left transition-colors duration-300 ${on ? "bg-ink text-white" : "bg-white hover:bg-[#f6f9f7]"}`}
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${on ? "bg-white text-ink" : "bg-sage"}`}>
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold">{s.title}</span>
                <span className={`mt-1 block text-sm ${on ? "text-white/70" : "text-muted"}`}>{s.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className="tile grid gap-4 bg-sage sm:grid-cols-2 sm:items-center">
        <img key={steps[active].img} src={steps[active].img} alt="" loading="lazy" className="rise aspect-square w-full rounded-2xl bg-white object-contain p-4" />
        <div>
          <p className="mb-3 text-sm font-semibold">{["Job posted", "Applications", "Escrow"][active]} · example</p>
          <StepPreview step={active} />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, openLogin } = useAuth();
  const [developers, setDevelopers] = useState(null);
  const [openJobs, setOpenJobs] = useState(null);

  useEffect(() => {
    const ctl = new AbortController();
    api("/api/developers", { signal: ctl.signal })
      .then(setDevelopers)
      .catch((e) => e.name !== "AbortError" && setDevelopers([]));
    api("/api/jobs?status=open", { signal: ctl.signal })
      .then(setOpenJobs)
      .catch((e) => e.name !== "AbortError" && setOpenJobs([]));
    return () => ctl.abort();
  }, []);

  return (
    <>
      <div className="container-page pt-4">
        {/* Overview row, like a dashboard header: live counts from the API */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-1 sm:grid-cols-4">
          <Stat label="Overview" value="Hire & get hired" />
          <Stat label="Developers" value={developers?.length.toLocaleString()} />
          <Stat label="Open jobs" value={openJobs?.length.toLocaleString()} />
          <Stat label="Platform fee" value="2% on release" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link to="/developers" className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-white">
            All
          </Link>
          {skills.map((s) => (
            <Link key={s} to="/developers" className="inline-flex min-h-11 items-center rounded-full border border-ink/20 px-5 text-sm hover:bg-white">
              {s}
            </Link>
          ))}
        </div>

        {/* Hero bento */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3" aria-labelledby="hero-title">
          <div className="tile relative grid gap-6 overflow-hidden bg-white sm:p-8 md:grid-cols-[1.1fr_1fr] lg:col-span-2">
            <div className="rise flex flex-col">
              <Badge tone="green" className="self-start">
                <img src="/eth.jpeg" alt="" width="14" height="14" className="h-3.5 w-3.5 rounded-full" /> Built on Ethereum · Paid in USDC
              </Badge>
              <h1 id="hero-title" className="mt-5 text-[2.5rem] font-semibold leading-[1.04] sm:text-5xl xl:text-[3.4rem]">
                Hire developers, pay in crypto
              </h1>
              <p className="mt-4 max-w-md text-muted">Find developers, manage projects and pay across borders. Money waits in escrow until the work is done.</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-8">
                <Button to="/developers">
                  Hire now <Icon name="arrow" size={18} />
                </Button>
                <Button to="/jobs" variant="secondary">
                  Find work
                </Button>
              </div>
            </div>
            <div className="relative hidden min-h-72 items-center justify-center rounded-2xl bg-paper md:flex">
              <img src="/Working remotely-bro.png" alt="A developer working remotely at a laptop" className="rise h-full max-h-80 w-full object-contain p-2" />
              <IconButton icon="arrowUpRight" label="Browse developers" to="/developers" className="absolute bottom-3 right-3 border border-ink/15" />
            </div>
          </div>
          <EscrowTile />
        </section>

        {/* Rules as pastel tiles */}
        <section aria-label="Escrow rules" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rules.map((r) => (
            <div key={r.title} className={`tile flex flex-col ${r.tint}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{r.title}</h2>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.tint === "bg-white" ? "bg-sage" : "bg-white/70"}`} aria-hidden="true">
                  <Icon name="sliders" size={16} />
                </span>
              </div>
              <p className="mt-6 text-5xl font-semibold tracking-tight">{r.big}</p>
              <p className="mt-2 text-sm text-ink-soft">{r.text}</p>
            </div>
          ))}
        </section>
      </div>

      {/* Developers */}
      <Section aria-labelledby="devs-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader align="left" eyebrow="Talent" id="devs-title" title="Developers" subtitle="Hire people with proven, escrow-backed work." />
          <Button to="/developers" variant="outline">
            View all <Icon name="arrow" size={16} />
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {developers === null && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
          {developers?.slice(0, 6).map((d) => <DeveloperCard key={d.id} dev={d} isMine={user?.id === d.userId} />)}
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
        <SectionHeader align="left" eyebrow="How it works" id="how-title" title="From brief to payout in three steps" subtitle="Pick a step to see what each side sees." />
        <HowItWorks />
      </Section>

      {/* Testimonials */}
      <Section aria-labelledby="t-title">
        <SectionHeader align="left" eyebrow="Testimonials" id="t-title" title="Trusted by founders, startups and Web3 teams" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Testimonial key={t.name} seed={i} {...t} />
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section>
        <div className="tile grid items-center gap-8 bg-ink p-8 text-white sm:p-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="stat-label !text-white/60">Start today</p>
            <h2 className="mt-1 text-4xl font-semibold sm:text-5xl">Ready to build something?</h2>
            <p className="mt-4 max-w-md text-white/70">Post a job in minutes. You only pay when you approve the work.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button to="/jobs/new" variant="solidLight">
                Post a job
              </Button>
              <Button to="/developers" variant="light">
                Browse developers
              </Button>
            </div>
          </div>
          <div className="hidden aspect-[4/3] items-center justify-center rounded-2xl bg-white p-6 md:flex">
            <img src="/Business growth-rafiki.svg" alt="" loading="lazy" className="h-full w-full object-contain" />
          </div>
        </div>
      </Section>
    </>
  );
}
