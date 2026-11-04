import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, m, useReducedMotion } from "motion/react";
import { Icon } from "./ui";

// A small looping demo for each step of "In three acts": a pointer reaches for the step's button, presses it,
// and the screen answers. Each one plays only while it is on screen, and shows its finished state, still, for
// people who ask their system for less motion.

const ease = [0.65, 0, 0.35, 1];
const row = "flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2";

// Steps through phases by their durations (ms), only while the scene is visible.
function useScene(durations) {
  const reduce = useReducedMotion();
  const box = useRef(null);
  const [p, setP] = useState(0);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.4 });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setP((x) => (x + 1) % durations.length), durations[p]);
    return () => clearTimeout(t);
  }, [p, inView, reduce, durations]);
  return { box, p: reduce ? durations.length - 1 : p, reduce };
}

// The pointer: rests in a corner, glides to the target while aiming, and shrinks with a ripple when it presses.
function Pointer({ box, target, aim, press, watch }) {
  const [pos, setPos] = useState({ aim: { x: 0, y: 0 }, rest: { x: 0, y: 0 } });
  useLayoutEffect(() => {
    const b = box.current?.getBoundingClientRect();
    const t = target.current?.getBoundingClientRect();
    if (!b || !t) return;
    setPos({ aim: { x: t.left - b.left + t.width * 0.62, y: t.top - b.top + t.height * 0.62 }, rest: { x: b.width - 46, y: b.height - 34 } });
  }, [box, target, aim, watch]);
  const at = aim ? pos.aim : pos.rest;
  return (
    <m.div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-20" initial={false} animate={{ x: at.x, y: at.y, scale: press ? 0.8 : 1 }} transition={{ x: { duration: 0.9, ease }, y: { duration: 0.9, ease }, scale: { duration: 0.15 } }}>
      <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_3px_6px_rgb(0_0_0/0.7)]">
        <path d="M4 2.5 19.5 12l-7 1.6L9.4 20.5Z" fill="#f3ece2" stroke="#1b1214" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {press && <m.span className="absolute -left-1 -top-1 h-6 w-6 rounded-full border-2 border-gold" initial={{ opacity: 0.9, scale: 0.5 }} animate={{ opacity: 0, scale: 2.4 }} transition={{ duration: 0.6 }} />}
    </m.div>
  );
}

// A number that counts up to its value when it appears.
function CountTo({ value }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const run = animate(0, value, { duration: 1, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => run.stop();
  }, [value]);
  return <span className="tabular-nums">${v.toLocaleString("en-US")}</span>;
}

const frame = "relative min-h-[14rem] overflow-hidden rounded-xl border border-line bg-paper/70 p-4";

// Step 1: the milestones are written in one by one, then Publish is pressed and the job opens for applications.
const postTimes = [900, 800, 800, 800, 1000, 450, 3000];
export function PostScene() {
  const { box, p } = useScene(postTimes);
  const publish = useRef(null);
  const rows = [
    ["Design system", "$400"],
    ["Wallet integration", "$900"],
    ["Launch and handover", "$500"],
  ];
  const done = p === 6;
  return (
    <div ref={box} aria-hidden="true" className={frame}>
      <p className="text-xs text-muted">New job</p>
      <p className="font-semibold">Token vesting dashboard</p>
      <div className="mt-2 min-h-[6.6rem] space-y-1.5 text-sm">
        <AnimatePresence initial={false}>
          {rows.slice(0, Math.min(3, p)).map(([t, v]) => (
            <m.p key={t} className={row} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <span className="truncate">{t}</span>
              <span className="font-medium tabular-nums">{v}</span>
            </m.p>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-xs text-muted">{p >= 3 ? "Budget $1,800" : "Adding milestones…"}</span>
        <m.span
          ref={publish}
          animate={{ scale: p === 5 ? 0.92 : 1 }}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-500 ${done ? "bg-gold/15 text-gold" : "bg-gold text-poster"}`}
        >
          <Icon name={done ? "check" : "send"} size={15} />
          {done ? "Open for applications" : "Publish job"}
        </m.span>
      </div>
      <Pointer box={box} target={publish} aim={p === 4 || p === 5} press={p === 5} watch={p} />
    </div>
  );
}

// Step 2: two applicants, and Hire is pressed on one of them.
const hireTimes = [1400, 1000, 450, 3200];
export function HireScene() {
  const { box, p } = useScene(hireTimes);
  const hire = useRef(null);
  const hired = p === 3;
  const people = [
    ["/profile2.svg", "Lena Kovač", "$1,800, 3 weeks", true],
    ["/profile1.svg", "Mei Tanaka", "$2,100, 2 weeks", false],
  ];
  return (
    <div ref={box} aria-hidden="true" className={frame}>
      <p className="text-xs text-muted">{hired ? "1 hired" : "2 applicants"}</p>
      <div className="mt-2 space-y-2 text-sm">
        {people.map(([img, name, quote, first]) => (
          <m.p key={name} className={`${row} !py-2.5 ring-1`} animate={{ opacity: hired && !first ? 0.45 : 1, boxShadow: hired && first ? "0 0 0 1px rgb(242 194 48 / 0.6)" : "0 0 0 1px rgb(255 255 255 / 0)" }} transition={{ duration: 0.6 }} style={{ "--tw-ring-color": "transparent" }}>
            <span className="flex min-w-0 items-center gap-2">
              <img src={img} alt="" className="h-9 w-9 shrink-0 rounded-full bg-raised object-cover" style={{ objectPosition: "50% 18%" }} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{name}</span>
                <span className="block truncate text-xs text-muted">{quote}</span>
              </span>
            </span>
            {first ? (
              <m.span
                ref={hire}
                animate={{ scale: p === 2 ? 0.9 : 1 }}
                className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-semibold transition-colors duration-500 ${hired ? "bg-gold/15 text-gold" : "bg-gold text-poster"}`}
              >
                {hired && <Icon name="check" size={13} />}
                {hired ? "Hired" : "Hire"}
              </m.span>
            ) : (
              <span className="shrink-0 rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-ink-soft">{hired ? "Not chosen" : "Shortlist"}</span>
            )}
          </m.p>
        ))}
      </div>
      <p className="mt-3 px-1 text-xs text-muted">{hired ? "Lena is hired. The contract is open, ready to fund." : "Compare quotes, message them, then hire one."}</p>
      <Pointer box={box} target={hire} aim={p === 1 || p === 2} press={p === 2} watch={p} />
    </div>
  );
}

// Step 3: the milestone waits in escrow, Approve is pressed, and the payout arrives.
const payTimes = [1400, 1000, 450, 3200];
export function PayScene() {
  const { box, p } = useScene(payTimes);
  const approve = useRef(null);
  const paid = p === 3;
  return (
    <div ref={box} aria-hidden="true" className={frame}>
      <p className="text-xs text-muted">Milestone 2 of 3</p>
      <p className="font-semibold">Wallet integration</p>
      <div className="mt-2 space-y-1.5 text-sm">
        <p className={row}>
          <span className="flex items-center gap-2">
            <Icon name={paid ? "unlock" : "lock"} size={15} className="text-gold" />
            <span className="font-medium">{paid ? "Released" : "In escrow"}</span>
          </span>
          <span className="font-semibold tabular-nums">$900</span>
        </p>
        <div className="min-h-[2.4rem]">
          <AnimatePresence>
            {paid && (
              <m.p className={row} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <span className="text-ink-soft">Paid to developer</span>
                <span className="font-semibold text-gold">
                  <CountTo value={882} />
                </span>
              </m.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-xs text-muted">{paid ? "2% fee, $18, taken on payout" : "Delivered, waiting for you"}</span>
        <m.span
          ref={approve}
          animate={{ scale: p === 2 ? 0.92 : 1 }}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-500 ${paid ? "bg-gold/15 text-gold" : "bg-gold text-poster"}`}
        >
          <Icon name="check" size={15} />
          {paid ? "Paid" : "Approve"}
        </m.span>
      </div>
      <Pointer box={box} target={approve} aim={p === 1 || p === 2} press={p === 2} watch={p} />
    </div>
  );
}
