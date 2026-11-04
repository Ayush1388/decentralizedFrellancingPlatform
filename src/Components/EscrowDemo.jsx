import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, m, useReducedMotion } from "motion/react";
import { Icon } from "./ui";

// One milestone, played out by a pointer that presses the buttons itself: the client funds it, the money travels
// along the rail and locks in escrow, the developer delivers, the client approves and the escrow pays the developer,
// less the 2% fee. Each step holds long enough to read the subtitle before the next one starts.

const PRICE = 600;
const FEE = 12;

const phases = [
  { id: "start", ms: 1800, step: 0 },
  { id: "aimFund", ms: 1500, step: 0 },
  { id: "pressFund", ms: 600, step: 0 },
  { id: "toEscrow", ms: 2200, step: 0 },
  { id: "locked", ms: 3400, step: 1 },
  { id: "aimDeliver", ms: 1500, step: 2 },
  { id: "pressDeliver", ms: 600, step: 2 },
  { id: "delivered", ms: 3400, step: 2 },
  { id: "aimApprove", ms: 1500, step: 3 },
  { id: "pressApprove", ms: 600, step: 3 },
  { id: "release", ms: 2400, step: 3 },
  { id: "paid", ms: 4200, step: 3 },
];
const at = (id) => phases.findIndex((p) => p.id === id);
// Where each step settles, for jumping to it or stepping through by hand.
const settled = ["start", "locked", "delivered", "paid"].map(at);

const steps = [
  { short: "Fund", title: "The client funds the milestone", text: "One click sends $600 USDC out of the client's wallet. It does not go to the developer yet." },
  { short: "Hold", title: "The money waits in escrow", text: "The escrow contract locks it. Neither side can take it alone, and the developer can see it is there before starting." },
  { short: "Deliver", title: "The developer delivers", text: "The work is handed over. The client has 7 days to review it or ask for changes." },
  { short: "Release", title: "Approved, and paid out", text: "Approval unlocks the escrow: $588 to the developer's wallet and the 2% fee, $12, to the platform." },
];

const usd = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const ease = [0.65, 0, 0.35, 1];

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
    const run = animate(from.current, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => run.stop();
  }, [value, reduce]);
  return <span className={`tabular-nums ${className}`}>{usd(shown)}</span>;
}

function Party({ refEl, photo, name, role, balance, active, tone }) {
  return (
    <div
      ref={refEl}
      className={`relative z-10 w-full rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] duration-700 sm:w-56 ${active ? "border-gold/60 bg-[#221c15] shadow-[0_0_0_1px_rgb(242_194_48/0.15),0_24px_60px_-24px_rgb(242_194_48/0.45)]" : "border-line bg-[#171313]"}`}
    >
      <div className="flex items-center gap-3">
        <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full bg-raised object-cover ring-2 ring-white/10" style={{ objectPosition: "50% 18%" }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className={`text-xs ${tone}`}>{role}</p>
        </div>
      </div>
      <p className="mt-4 text-[1.75rem] font-semibold leading-none">
        <Amount value={balance} />
      </p>
      <p className="mt-1.5 text-xs text-muted">USDC in wallet</p>
    </div>
  );
}

// The track money runs along between two parties; it lights up while money is on it.
function Rail({ lit, done }) {
  const fill = { type: "tween", duration: 1.6, ease };
  const glow = "bg-gold shadow-[0_0_14px_rgb(242_194_48/0.75)]";
  return (
    <div aria-hidden="true" className="relative mx-auto h-10 w-0.5 sm:mx-0 sm:h-0.5 sm:w-auto sm:flex-1">
      <div className="absolute inset-0 rounded-full bg-white/[0.08]" />
      <m.div className={`absolute inset-0 hidden origin-left rounded-full sm:block ${glow}`} initial={false} animate={{ scaleX: lit ? 1 : 0, opacity: done ? 0.25 : 1 }} transition={fill} />
      <m.div className={`absolute inset-0 origin-top rounded-full sm:hidden ${glow}`} initial={false} animate={{ scaleY: lit ? 1 : 0, opacity: done ? 0.25 : 1 }} transition={fill} />
    </div>
  );
}

// The vault: a padlock in a ring that fills as the money locks in and drains as it is released.
function Vault({ refEl, held, released }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div ref={refEl} className="relative z-10 mx-auto flex w-44 shrink-0 flex-col items-center py-2 text-center sm:mx-0">
      <div className="relative h-28 w-28">
        <m.div
          aria-hidden="true"
          className="absolute -inset-8 rounded-full"
          initial={false}
          animate={{ opacity: held ? 1 : 0, scale: held ? 1 : 0.8 }}
          transition={{ duration: 1.2 }}
          style={{ background: "radial-gradient(circle, rgb(242 194 48 / 0.28), transparent 65%)" }}
        />
        <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90">
          <circle cx="56" cy="56" r={r} fill="#171313" stroke="#3d3332" strokeWidth="4" />
          <m.circle cx="56" cy="56" r={r} fill="none" stroke="#f2c230" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: held ? 0 : c }} transition={{ duration: 1.6, ease }} />
        </svg>
        <m.span
          className={`absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-700 ${held ? "bg-gold text-poster" : "bg-white/[0.05] text-muted"}`}
          initial={false}
          animate={held ? { rotate: [0, -12, 0], scale: [1, 1.12, 1] } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: held ? 1.2 : 0 }}
        >
          <Icon name={held ? "lock" : "unlock"} size={22} />
        </m.span>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Escrow contract</p>
      <p className="mt-1 text-2xl font-semibold">
        <Amount value={held ? PRICE : 0} />
      </p>
      <p className={`text-xs ${held ? "text-gold" : "text-muted"}`}>{held ? "Locked" : released ? "Released" : "Empty"}</p>
    </div>
  );
}

// A coin running from one point of the stage to another.
function Coin({ from, to, delay, small }) {
  const size = small ? 18 : 26;
  const sideways = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
  return (
    <m.span
      className="pointer-events-none absolute left-0 top-0 z-20 flex items-center justify-center rounded-full border border-[#a07d14] bg-[radial-gradient(circle_at_35%_30%,#ffe9a8,#f2c230_55%,#c99a12)] font-poster text-poster shadow-[0_0_16px_rgb(242_194_48/0.7)]"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, fontSize: small ? 9 : 12 }}
      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.4 }}
      animate={{
        x: [from.x, (from.x + to.x) / 2, to.x],
        y: sideways ? [from.y, from.y - 20, to.y] : [from.y, (from.y + to.y) / 2, to.y],
        opacity: [0, 1, 1, 0],
        scale: [0.4, 1, 1, 0.5],
      }}
      transition={{ duration: 1.5, delay, ease, times: [0, 0.5, 1] }}
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
    setPos({ client: c(client), vault: c(vault, 0.5, 0.3), dev: c(dev), action: c(action, 0.55, 0.6), fee: c(fee), job: c(job, 0.25, 0.4), rest: { x: s.width - 150, y: s.height - 70 } });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [measure]);

  // It plays only while it is on screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
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
  const held = funded && !released;
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
  // Between presses the pointer waits out of the way; its tag only shows while someone is reaching for a button.
  const cursorAt = pos ? (aiming ? pos.action : pos.rest) : { x: 0, y: 0 };
  const actor = aiming ? act.who : null;
  // Whose turn it is lights up their wallet: the client funds and approves, the developer delivers and gets paid.
  const clientTurn = step === 0 || id === "aimApprove" || id === "pressApprove";
  const devTurn = step === 2 || released;
  const statusTone = { "Not funded": "bg-white/[0.08] text-ink-soft", "In escrow": "bg-[#8fb8f0]/15 text-[#b4d0f6]", "In review": "bg-amber-200/40 text-amber-800", Paid: "bg-gold/15 text-gold" }[status];

  // How far through its step the take will be when the current phase ends, for the progress strip.
  const ofStep = phases.filter((x) => x.step === step);
  const stepMs = ofStep.reduce((t, x) => t + x.ms, 0);
  const doneMs = phases.slice(0, p + 1).filter((x) => x.step === step).reduce((t, x) => t + x.ms, 0);
  const running = playing && inView;

  function jump(s) {
    setP(settled[s]);
    setPlaying(false);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-[#120e0e] shadow-[0_40px_100px_-50px_rgb(0_0_0/0.9)]">
      {/* progress strip: the four steps, the current one filling as it plays */}
      <ol className="grid grid-cols-4 border-b border-line">
        {steps.map((s, i) => (
          <li key={s.short}>
            <button type="button" onClick={() => jump(i)} aria-current={step === i ? "step" : undefined} className="group relative w-full px-3 pb-3.5 pt-4 text-left sm:px-6">
              <span className={`flex items-center gap-2 text-sm font-semibold transition-colors ${step === i ? "text-ink" : step > i ? "text-ink-soft" : "text-muted group-hover:text-ink-soft"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors ${step > i ? "bg-gold/20 text-gold" : step === i ? "bg-gold text-poster" : "bg-white/[0.06]"}`}>
                  {step > i ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.short}</span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/[0.06]">
                <m.span
                  className="block h-full origin-left bg-gold"
                  initial={false}
                  animate={{ scaleX: step > i ? 1 : step === i ? doneMs / stepMs : 0 }}
                  transition={step === i && running ? { duration: phases[p].ms / 1000, ease: "linear" } : { duration: 0.3 }}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* The stage is a picture of the subtitles below it, so it is hidden from screen readers. */}
      <div
        ref={stage}
        aria-hidden="true"
        className="relative select-none px-4 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10"
        style={{ background: "radial-gradient(60% 70% at 50% 0%, rgb(242 194 48 / 0.09), transparent 70%)" }}
      >
        <div className="flex flex-col items-stretch sm:flex-row sm:items-center">
          <Party refEl={client} photo="/profile1.svg" name="Olivia Park" role="Client" tone="text-gold" balance={funded ? 1000 - PRICE : 1000} active={clientTurn && !released} />
          <Rail lit={funded} done={released} />
          <Vault refEl={vault} held={held} released={released} />
          <Rail lit={released} />
          <Party refEl={dev} photo="/profile2.svg" name="Lena Kovač" role="Developer" tone="text-[#b4d0f6]" balance={released ? PRICE - FEE : 0} active={devTurn} />
        </div>

        {/* the milestone on the job page, where the buttons are pressed, and the platform's share */}
        <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-stretch">
          <div ref={job} className="relative flex-1 overflow-hidden rounded-2xl border border-line bg-[#171313] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Milestone 1 of 3</p>
                <p className="mt-0.5 text-lg font-semibold">Wallet connect and listings</p>
              </div>
              <span className="text-xl font-semibold tabular-nums">{usd(PRICE)}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span key={status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone}`}>
                  {status}
                </m.span>
              </AnimatePresence>
              {p >= at("delivered") && (
                <m.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.9 }} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-ink-soft">
                  <Icon name="link" size={12} /> Delivery link attached
                </m.span>
              )}
              {status === "In review" && <span className="text-xs text-muted">7 days to review</span>}
            </div>
            <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
              <span className="text-xs text-muted">{act.who ? `${act.who}'s button` : "Done"}</span>
              <m.span
                ref={action}
                animate={{ scale: pressing ? 0.93 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className={`relative ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors duration-500 ${act.who ? "bg-gold text-poster shadow-[0_10px_30px_-10px_rgb(242_194_48/0.7)]" : "bg-gold/10 text-gold"}`}
              >
                <Icon name={act.icon} size={16} />
                {act.label}
                {pressing && <m.span className="absolute inset-0 rounded-xl border-2 border-gold" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 0.7 }} />}
              </m.span>
            </div>
          </div>
          <div ref={fee} className={`flex flex-col items-center justify-center rounded-2xl border px-6 py-4 text-center transition-colors duration-700 sm:w-48 ${released ? "border-gold/40 bg-gold/[0.05]" : "border-line bg-[#171313]"}`}>
            <p className="text-xs text-muted">Platform fee, 2%</p>
            <p className="mt-1 text-2xl font-semibold">
              <Amount value={released ? FEE : 0} />
            </p>
            <p className="text-xs text-muted">only taken on payout</p>
          </div>
        </div>

        {/* the money and the delivery in flight */}
        {pos && !reduce && (
          <>
            {id === "toEscrow" && Array.from({ length: 7 }).map((_, i) => <Coin key={`in${i}`} from={pos.client} to={pos.vault} delay={i * 0.12} />)}
            {id === "release" && Array.from({ length: 7 }).map((_, i) => <Coin key={`out${i}`} from={pos.vault} to={pos.dev} delay={i * 0.12} />)}
            {id === "release" && <Coin key="fee" from={pos.vault} to={pos.fee} delay={0.9} small />}
            {id === "delivered" && (
              <m.span
                className="pointer-events-none absolute left-0 top-0 z-20 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-lg bg-ticket text-poster shadow-[0_12px_30px_-8px_rgb(0_0_0/0.8)]"
                initial={{ x: pos.dev.x, y: pos.dev.y, opacity: 0, rotate: -8 }}
                animate={{ x: [pos.dev.x, pos.job.x], y: [pos.dev.y, pos.job.y], opacity: [0, 1, 1, 0], rotate: [-8, 4, 0] }}
                transition={{ duration: 1.8, ease, times: [0, 0.2, 0.85, 1] }}
              >
                <Icon name="file" size={18} />
              </m.span>
            )}
          </>
        )}

        {/* the pointer, with a tag saying whose hand it is */}
        {pos && (
          <m.div
            className="pointer-events-none absolute left-0 top-0 z-30"
            initial={false}
            animate={{ x: cursorAt.x, y: cursorAt.y, scale: pressing ? 0.82 : 1 }}
            transition={{ x: { duration: 1.3, ease }, y: { duration: 1.3, ease }, scale: { duration: 0.2 } }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" className="drop-shadow-[0_3px_6px_rgb(0_0_0/0.7)]">
              <path d="M4 2.5 19.5 12l-7 1.6L9.4 20.5Z" fill="#f3ece2" stroke="#1b1214" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <AnimatePresence>
              {actor && (
                <m.span
                  key={actor}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`ml-5 mt-0.5 inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-lg ${actor === "Developer" ? "bg-[#b4d0f6] text-poster" : "bg-gold text-poster"}`}
                >
                  {actor}
                </m.span>
              )}
            </AnimatePresence>
          </m.div>
        )}
      </div>

      {/* subtitles: what is happening right now, in words, plus the controls */}
      <div className="flex flex-col gap-4 border-t border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-h-[5.5rem] sm:min-h-[4.5rem]" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45 }}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Step {step + 1} of 4</p>
              <p className="mt-1 text-xl font-semibold text-ink">{steps[step].title}</p>
              <p className="mt-1 max-w-2xl text-ink-soft">{steps[step].text}</p>
            </m.div>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3d3332] px-4 text-sm font-medium text-ink-soft hover:border-[#6a5a55] hover:text-ink"
          >
            <Icon name={playing ? "pause" : "play"} size={16} />
            {playing ? "Pause" : "Play"}
          </button>
          {playing ? (
            <button type="button" onClick={() => setP(0)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink">
              <Icon name="refresh" size={16} /> Replay
            </button>
          ) : (
            <button type="button" onClick={() => jump((step + 1) % steps.length)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gold hover:underline">
              {step === steps.length - 1 ? "Start over" : "Next step"} <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
