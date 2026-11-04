import { useEffect, useState } from "react";
import { animate, m, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { reelDate } from "../lib/cinema";
import { Button } from "./ui";
import { Bulbs } from "./cinema";

// The lobby: a projector beam with dust turning in it, the marquee running, the ticket under the light,
// and posters for the kinds of work hanging either side. The ticket and the posters answer the pointer.

const settle = { type: "spring", stiffness: 120, damping: 18 };

// Dust in the beam. Fixed positions so the picture is the same on every visit.
const motes = Array.from({ length: 22 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 9301 + n * 49297) + 1) / 2) % 1;
  return {
    left: 38 + r(1) * 24,
    top: 18 + r(2) * 62,
    size: 1 + r(3) * 2,
    o: 0.25 + r(4) * 0.55,
    t: 9 + r(5) * 9,
    d: -r(6) * 14,
    dx: (r(7) - 0.5) * 60,
  };
});

function Beam() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[640px] max-w-5xl">
      <div
        className="beam absolute inset-0"
        style={{
          background: "conic-gradient(from 180deg at 50% -6%, transparent 160deg, rgb(255 222 140 / 0.07) 170deg, rgb(255 232 170 / 0.15) 180deg, rgb(255 222 140 / 0.07) 190deg, transparent 200deg)",
          maskImage: "linear-gradient(to bottom, black 35%, transparent 95%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 35%, transparent 95%)",
        }}
      />
      {motes.map((p, i) => (
        <span
          key={i}
          className="mote absolute rounded-full bg-[#ffe9b0]"
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, "--o": p.o, "--t": `${p.t}s`, "--d": `${p.d}s`, "--dx": `${p.dx}px` }}
        />
      ))}
    </div>
  );
}

// Counts up to a number when it arrives, once.
function CountUp({ value }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof value !== "number") return;
    if (reduce) {
      setShown(value);
      return;
    }
    const run = animate(0, value, { duration: 1.3, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => run.stop();
  }, [value, reduce]);
  return typeof value === "number" ? shown : "–";
}

// The admission ticket. It tilts toward the pointer under a moving foil sheen; the two ways in are printed on it.
function Ticket({ devCount, jobCount, px, py }) {
  const serial = String(1000 + (devCount ?? 0)).padStart(6, "0");
  const rotateX = useTransform(py, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(px, [-0.5, 0.5], [-9, 9]);
  const sheen = useTransform(px, [-0.5, 0.5], ["-60%", "260%"]);
  const facts = [
    ["Open jobs", <CountUp key="j" value={jobCount} />],
    ["Developers", <CountUp key="d" value={devCount} />],
    ["Fee", "2% on payouts"],
  ];
  return (
    <m.div
      className="relative mx-auto max-w-4xl [perspective:1400px]"
      style={{ transformPerspective: 1400 }}
      initial={{ opacity: 0, y: 48, rotateX: 16 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ ...settle, delay: 0.15 }}
    >
      <m.div style={{ rotateX, rotateY }} className="relative flex flex-col overflow-hidden bg-ticket text-poster shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)] sm:flex-row">
        {/* notches where the ticket would be torn */}
        <span aria-hidden="true" className="absolute -top-4 left-[calc(100%-11.5rem)] z-10 hidden h-8 w-8 rounded-full bg-paper sm:block" />
        <span aria-hidden="true" className="absolute -bottom-4 left-[calc(100%-11.5rem)] z-10 hidden h-8 w-8 rounded-full bg-paper sm:block" />

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

        {/* foil: a band of light that follows the pointer, and one pass across when the lobby opens */}
        <m.span aria-hidden="true" style={{ x: sheen }} className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent mix-blend-soft-light" />
        <m.span
          aria-hidden="true"
          initial={{ x: "-120%" }}
          animate={{ x: "420%" }}
          transition={{ duration: 1.4, delay: 0.9, ease: [0.4, 0, 0.2, 1] }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent mix-blend-soft-light"
        />
      </m.div>
    </m.div>
  );
}

export default function Hero({ devCount, jobCount }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 120, damping: 20, mass: 0.6 });

  function track(e) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function release() {
    px.set(0);
    py.set(0);
  }

  return (
    <section onPointerMove={track} onPointerLeave={release} className="relative overflow-x-clip px-4 pb-6 pt-10 sm:pt-14" style={{ background: "radial-gradient(45% 60% at 50% 0%, rgb(242 194 48 / 0.14), transparent 70%)" }}>
      <Beam />
      <Bulbs count={36} className="relative mx-auto mb-5 max-w-4xl px-2" />
      <Ticket devCount={devCount} jobCount={jobCount} px={sx} py={sy} />
    </section>
  );
}
