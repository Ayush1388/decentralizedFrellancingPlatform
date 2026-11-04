import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, m, useReducedMotion } from "motion/react";
import { Icon } from "./ui";

// One milestone, played out by a pointer that presses the buttons itself: the client funds it, the money locks in
// escrow, the developer delivers, the client approves and the escrow pays the developer, less the 2% fee.

const PRICE = 600;
const FEE = 12;

// The take, phase by phase. "step" is which of the four written steps is current.
const phases = [
  { id: "start", ms: 1000, step: 0 },
  { id: "aimFund", ms: 1100, step: 0 },
  { id: "pressFund", ms: 380, step: 0 },
  { id: "toEscrow", ms: 1400, step: 1 },
  { id: "locked", ms: 1500, step: 1 },
  { id: "aimDeliver", ms: 1100, step: 2 },
  { id: "pressDeliver", ms: 380, step: 2 },
  { id: "delivered", ms: 1700, step: 2 },
  { id: "aimApprove", ms: 1100, step: 3 },
  { id: "pressApprove", ms: 380, step: 3 },
  { id: "release", ms: 1500, step: 3 },
  { id: "paid", ms: 2800, step: 3 },
];
const at = (id) => phases.findIndex((p) => p.id === id);
// Where each step settles, for jumping to it or stepping through by hand.
const settled = ["start", "locked", "delivered", "paid"].map(at);

const steps = [
  ["The client funds the milestone", "One click moves $600 USDC out of the client's wallet. It does not go to the developer yet."],
  ["The money waits in escrow", "The escrow contract holds it. Neither side can take it alone, and the developer can see it is there before starting."],
  ["The developer delivers", "The work is handed over and the client has 7 days to review it or ask for changes."],
  ["The client approves and it pays out", "Approval releases the milestone: $588 to the developer's wallet and the 2% fee, $12, to the platform."],
];

const usd = (v) => `$${Math.round(v).toLocaleString("en-US")}`;

// A balance that counts to its new value instead of jumping.
function Amount({ value, className = "" }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const run = animate(from.current, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => run.stop();
  }, [value, reduce]);
  return <span className={`tabular-nums ${className}`}>{usd(shown)}</span>;
}

function Wallet({ refEl, name, role, balance, glow, hue }) {
  return (
    <div ref={refEl} className={`rounded-xl border p-3 transition-colors duration-500 sm:p-4 ${glow ? "border-gold/60 bg-gold/[0.06]" : "border-line bg-paper/60"}`}>
      <div className="flex items-center gap-2">
        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-poster sm:flex" style={{ background: hue }}>
          {name
            .split(" ")
            .map((w) => w[0])
            .join("")}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold leading-tight sm:truncate sm:text-sm">{name}</span>
          <span className="block text-xs text-muted">{role}</span>
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold sm:text-2xl">
        <Amount value={balance} />
      </p>
      <p className="text-xs text-muted">USDC in wallet</p>
    </div>
  );
}

// A coin flying in an arc from one point of the stage to another.
function Coin({ from, to, delay, small }) {
  const lift = Math.min(from.y, to.y) - 70;
  return (
    <m.span
      className={`pointer-events-none absolute left-0 top-0 z-20 flex items-center justify-center rounded-full border-2 border-[#a07d14] bg-gold font-poster text-poster shadow-[0_0_12px_rgb(242_194_48/0.6)] ${small ? "h-5 w-5 text-[0.6rem]" : "h-7 w-7 text-xs"}`}
      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.5 }}
      animate={{ x: [from.x, (from.x + to.x) / 2, to.x], y: [from.y, lift, to.y], opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 0.6] }}
      transition={{ duration: 0.95, delay, ease: "easeInOut", times: [0, 0.5, 1] }}
      style={{ marginLeft: small ? -10 : -14, marginTop: small ? -10 : -14 }}
    >
      $
    </m.span>
  );
}

export default function EscrowDemo() {
  const reduce = useReducedMotion();
  const stage = useRef(null);
  const client = useRef(null);
  const vault = useRef(null);
  const dev = useRef(null);
  const action = useRef(null);
  const fee = useRef(null);
  const job = useRef(null);
  const [pos, setPos] = useState(null);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const [inView, setInView] = useState(false);

  // Where everything sits on the stage, so the pointer and the coins know where to go.
  const measure = useCallback(() => {
    const s = stage.current?.getBoundingClientRect();
    if (!s) return;
    const c = (el, dx = 0.5, dy = 0.5) => {
      const r = el.current.getBoundingClientRect();
      return { x: r.left - s.left + r.width * dx, y: r.top - s.top + r.height * dy };
    };
    setPos({ client: c(client), vault: c(vault), dev: c(dev), action: c(action, 0.55, 0.6), fee: c(fee), job: c(job, 0.3, 0.5), rest: { x: s.width - 60, y: s.height - 30 } });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [measure]);

  // It plays only while it is on screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(stage.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !inView) return;
    const t = setTimeout(() => setP((x) => (x + 1) % phases.length), phases[p].ms);
    return () => clearTimeout(t);
  }, [p, playing, inView]);

  const id = phases[p].id;
  const step = phases[p].step;
  const funded = p >= at("toEscrow");
  const released = p >= at("release");
  const status = !funded ? "Not funded" : p < at("delivered") ? "In escrow" : !released ? "In review" : "Paid";
  const act =
    status === "Not funded"
      ? { who: "Client", label: `Fund ${usd(PRICE)}`, icon: "lock" }
      : status === "In escrow"
        ? { who: "Developer", label: "Deliver work", icon: "send" }
        : status === "In review"
          ? { who: "Client", label: "Approve and release", icon: "check" }
          : { who: null, label: "Paid", icon: "check" };
  const pressing = id.startsWith("press");
  const aiming = id.startsWith("aim") || pressing;
  const cursorAt = pos ? (aiming ? pos.action : id === "start" || id === "paid" ? pos.rest : { x: pos.action.x + 70, y: pos.action.y + 40 }) : { x: 0, y: 0 };
  const actor = act.who || "Client";
  const statusTone = { "Not funded": "bg-white/[0.08] text-ink-soft", "In escrow": "bg-[#8fb8f0]/15 text-[#b4d0f6]", "In review": "bg-amber-200/40 text-amber-800", Paid: "bg-gold/15 text-gold" }[status];

  function jump(s) {
    setP(settled[s]);
    setPlaying(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* The stage is a picture of the steps written beside it, so it is hidden from screen readers. */}
      <div ref={stage} aria-hidden="true" className="relative select-none overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-6" style={{ background: "radial-gradient(70% 60% at 50% 0%, rgb(242 194 48 / 0.08), transparent 70%), var(--color-surface)" }}>
        <div className="grid grid-cols-3 items-start gap-3 sm:gap-6">
          <Wallet refEl={client} name="Demo Client" role="Client" balance={funded ? 1000 - PRICE : 1000} glow={actor === "Client" && !released} hue="#f2c230" />

          {/* the vault */}
          <div ref={vault} className={`relative rounded-xl border-2 p-3 text-center transition-colors duration-500 sm:p-4 ${funded && !released ? "border-gold bg-gold/[0.08] shadow-[0_0_40px_-8px_rgb(242_194_48/0.5)]" : "border-dashed border-[#3d3332]"}`}>
            <m.span
              className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${funded && !released ? "bg-gold text-poster" : "bg-white/[0.06] text-muted"}`}
              animate={funded && !released ? { scale: [1, 1.15, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Icon name={funded && !released ? "lock" : "unlock"} size={20} />
            </m.span>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Escrow</p>
            <p className="text-xl font-semibold sm:text-2xl">
              <Amount value={funded && !released ? PRICE : 0} />
            </p>
            <p className="text-xs text-muted">{funded && !released ? "locked" : released ? "released" : "empty"}</p>
          </div>

          <Wallet refEl={dev} name="Lena Kovač" role="Developer" balance={released ? PRICE - FEE : 0} glow={actor === "Developer" || released} hue="#f1e7cf" />
        </div>

        {/* the milestone on the job page, where the buttons are pressed */}
        <div className="mt-6 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:items-end">
          <div ref={job} className="min-w-0 flex-1 rounded-xl border border-line bg-paper/70 p-4">
            <p className="text-xs text-muted">Milestone 1</p>
            <p className="mt-0.5 font-semibold">Wallet connect and listings</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold tabular-nums">{usd(PRICE)}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span key={status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone}`}>
                  {status}
                </m.span>
              </AnimatePresence>
              {p >= at("delivered") && (
                <m.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-ink-soft">
                  <Icon name="link" size={12} /> delivery link
                </m.span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              {act.who && <span className="text-xs text-muted">{act.who}:</span>}
              <m.span
                ref={action}
                animate={{ scale: pressing ? 0.94 : 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className={`relative inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${act.who ? "bg-gold text-poster" : "bg-white/[0.06] text-gold"}`}
              >
                <Icon name={act.icon} size={16} />
                {act.label}
                {pressing && <m.span className="absolute inset-0 rounded-lg border-2 border-gold" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 0.5 }} />}
              </m.span>
            </div>
          </div>
          <div ref={fee} className={`rounded-xl border px-4 py-3 text-center transition-colors duration-500 sm:w-36 ${released ? "border-gold/40 text-ink" : "border-line text-muted"}`}>
            <p className="text-xs">Platform fee</p>
            <p className="text-lg font-semibold">
              <Amount value={released ? FEE : 0} />
            </p>
          </div>
        </div>

        {/* the money and the delivery in flight */}
        {pos && !reduce && (
          <>
            {id === "toEscrow" && Array.from({ length: 6 }).map((_, i) => <Coin key={`in${i}`} from={pos.client} to={pos.vault} delay={i * 0.09} />)}
            {id === "release" && Array.from({ length: 6 }).map((_, i) => <Coin key={`out${i}`} from={pos.vault} to={pos.dev} delay={i * 0.09} />)}
            {id === "release" && <Coin key="fee" from={pos.vault} to={pos.fee} delay={0.55} small />}
            {id === "delivered" && (
              <m.span
                className="pointer-events-none absolute left-0 top-0 z-20 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-md bg-ticket text-poster shadow-lg"
                initial={{ x: pos.dev.x, y: pos.dev.y, opacity: 0 }}
                animate={{ x: [pos.dev.x, pos.job.x], y: [pos.dev.y, pos.job.y], opacity: [0, 1, 0] }}
                transition={{ duration: 1.1, ease: "easeInOut" }}
              >
                <Icon name="file" size={16} />
              </m.span>
            )}
          </>
        )}

        {/* the pointer, with a tag saying whose hand it is */}
        {pos && (
          <m.div className="pointer-events-none absolute left-0 top-0 z-30" initial={false} animate={{ x: cursorAt.x, y: cursorAt.y, scale: pressing ? 0.85 : 1 }} transition={{ x: { duration: 0.95, ease: [0.4, 0, 0.2, 1] }, y: { duration: 0.95, ease: [0.4, 0, 0.2, 1] }, scale: { duration: 0.15 } }}>
            <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgb(0_0_0/0.6)]">
              <path d="M4 2.5 19.5 12l-7 1.6L9.4 20.5Z" fill="#f3ece2" stroke="#1b1214" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className={`ml-4 mt-0.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${actor === "Developer" ? "bg-ticket text-poster" : "bg-gold text-poster"}`}>{actor}</span>
          </m.div>
        )}
      </div>

      {/* The same story in words, which also lets anyone jump to a step. */}
      <div>
        <ol className="space-y-2">
          {steps.map(([title, text], i) => (
            <li key={title}>
              <button
                type="button"
                onClick={() => jump(i)}
                aria-current={step === i ? "step" : undefined}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${step === i ? "border-gold/50 bg-gold/[0.06]" : "border-line hover:border-[#4a3d38]"}`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${step > i ? "bg-gold/20 text-gold" : step === i ? "bg-gold text-poster" : "bg-white/[0.06] text-muted"}`}>
                    {step > i ? <Icon name="check" size={14} /> : i + 1}
                  </span>
                  <span className="font-semibold">{title}</span>
                </span>
                {step === i && (
                  <m.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 block overflow-hidden pl-10 text-sm text-ink-soft">
                    {text}
                  </m.span>
                )}
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3d3332] px-4 text-sm font-medium text-ink-soft hover:border-[#6a5a55] hover:text-ink"
          >
            <Icon name={playing ? "pause" : "play"} size={16} />
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setP(0);
              setPlaying(true);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <Icon name="refresh" size={16} /> Replay
          </button>
          {!playing && (
            <button
              type="button"
              onClick={() => jump((step + 1) % steps.length)}
              className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gold hover:underline"
            >
              {step === steps.length - 1 ? "Start over" : "Next step"} <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          Step {step + 1} of 4: {steps[step][0]}
        </p>
      </div>
    </div>
  );
}
