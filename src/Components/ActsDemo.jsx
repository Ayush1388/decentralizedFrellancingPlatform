import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, m, useReducedMotion } from "motion/react";
import { Icon } from "./ui";

// The whole job in one take, inside a small window of the site: the job is written and published, applications
// come in, a profile is opened and the developer hired, the brief is sent with its files, the work comes back
// and is approved. A pointer does the clicking; the subtitles say what is happening.

const ease = [0.65, 0, 0.35, 1];

const phases = [
  { id: "empty", ms: 700, act: 0 },
  { id: "typeTitle", ms: 1300, act: 0 },
  { id: "typeDesc", ms: 1700, act: 0 },
  { id: "milestones", ms: 1800, act: 0 },
  { id: "aimPublish", ms: 900, act: 0, aim: "publish" },
  { id: "pressPublish", ms: 450, act: 0, aim: "publish", press: true },
  { id: "published", ms: 1500, act: 0 },
  { id: "arrive", ms: 2000, act: 1 },
  { id: "aimProfile", ms: 900, act: 1, aim: "profile" },
  { id: "pressProfile", ms: 450, act: 1, aim: "profile", press: true },
  { id: "profile", ms: 2200, act: 1 },
  { id: "aimHire", ms: 900, act: 1, aim: "hire" },
  { id: "pressHire", ms: 450, act: 1, aim: "hire", press: true },
  { id: "hired", ms: 1600, act: 1 },
  { id: "compose", ms: 1500, act: 2 },
  { id: "aimAttach", ms: 800, act: 2, aim: "attach" },
  { id: "pressAttach", ms: 450, act: 2, aim: "attach", press: true },
  { id: "attached", ms: 900, act: 2 },
  { id: "aimSend", ms: 800, act: 2, aim: "send" },
  { id: "pressSend", ms: 450, act: 2, aim: "send", press: true },
  { id: "sent", ms: 1100, act: 2 },
  { id: "reply", ms: 1600, act: 2 },
  { id: "delivered", ms: 1500, act: 2 },
  { id: "aimApprove", ms: 900, act: 2, aim: "approve" },
  { id: "pressApprove", ms: 450, act: 2, aim: "approve", press: true },
  { id: "completed", ms: 2800, act: 2 },
];
const at = (id) => phases.findIndex((x) => x.id === id);
const actStart = [0, at("arrive"), at("compose")];
const actEnd = [at("published"), at("hired"), at("completed")];

const acts = [
  { short: "Post the job", url: "picturehouse.app/jobs/new" },
  { short: "Hire a developer", url: "picturehouse.app/jobs/24" },
  { short: "Get the work done", url: "picturehouse.app/jobs/24#chat" },
];

const captions = {
  empty: "Write the job: what you need, and what done looks like.",
  typeTitle: "Write the job: what you need, and what done looks like.",
  typeDesc: "Write the job: what you need, and what done looks like.",
  milestones: "Split the budget into milestones. You pay one at a time, never all up front.",
  aimPublish: "Split the budget into milestones. You pay one at a time, never all up front.",
  pressPublish: "Publish it, and developers can apply straight away.",
  published: "Publish it, and developers can apply straight away.",
  arrive: "Applications come in with a quote and a delivery time.",
  aimProfile: "Open a profile to see ratings, finished jobs and skills.",
  pressProfile: "Open a profile to see ratings, finished jobs and skills.",
  profile: "Open a profile to see ratings, finished jobs and skills.",
  aimHire: "Hire the person you want. Their contract opens with your milestones.",
  pressHire: "Hire the person you want. Their contract opens with your milestones.",
  hired: "Hire the person you want. Their contract opens with your milestones.",
  compose: "Send the brief and the files in the job's own chat.",
  aimAttach: "Send the brief and the files in the job's own chat.",
  pressAttach: "Send the brief and the files in the job's own chat.",
  attached: "Send the brief and the files in the job's own chat.",
  aimSend: "Send the brief and the files in the job's own chat.",
  pressSend: "Send the brief and the files in the job's own chat.",
  sent: "Send the brief and the files in the job's own chat.",
  reply: "The developer works and talks to you in the same place.",
  delivered: "The work is delivered on the job page, ready for review.",
  aimApprove: "Approve it, and that milestone is paid out of escrow.",
  pressApprove: "Approve it, and that milestone is paid out of escrow.",
  completed: "Done: the work is yours and the developer is paid, less the 2% fee.",
};

// Text that types itself while its phase plays, and stays written after.
function Typed({ text, active, done, ms }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(done ? text.length : 0);
  useEffect(() => {
    if (done || reduce) {
      setN(text.length);
      return;
    }
    if (!active) {
      setN(0);
      return;
    }
    const run = animate(0, text.length, { duration: (ms - 150) / 1000, ease: "linear", onUpdate: (v) => setN(Math.round(v)) });
    return () => run.stop();
  }, [active, done, text, ms, reduce]);
  return (
    <>
      {text.slice(0, n)}
      {active && n < text.length && <span className="ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] animate-pulse bg-gold" />}
    </>
  );
}

const field = "rounded-lg border border-line bg-paper/70 px-3 py-2 text-sm";

export default function ActsDemo() {
  const reduce = useReducedMotion();
  const box = useRef(null);
  const targets = useRef({});
  const reg = (k) => (el) => {
    if (el) targets.current[k] = el;
  };
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [ptr, setPtr] = useState(null);

  const ph = phases[p];
  const act = ph.act;
  const past = (id) => p >= at(id);
  const now = (id) => p === at(id);

  // Without motion it opens on the finished first act, and "Next act" steps through.
  useEffect(() => {
    if (reduce) setP(actEnd[0]);
  }, [reduce]);

  // Plays only while on screen, and not at all for people who ask for less motion.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || !inView || reduce) return;
    const t = setTimeout(() => setP((x) => (x + 1) % phases.length), ph.ms);
    return () => clearTimeout(t);
  }, [p, playing, inView, reduce, ph.ms]);

  // Where the pointer should be: on the button it is reaching for, or resting in a corner.
  const place = useCallback(() => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const el = ph.aim && targets.current[ph.aim];
    const r = el && el.isConnected ? el.getBoundingClientRect() : null;
    setPtr(r ? { x: r.left - b.left + r.width * 0.6, y: r.top - b.top + r.height * 0.62 } : { x: b.width - 60, y: b.height - 40 });
  }, [ph.aim]);
  useLayoutEffect(() => {
    place();
    // a new screen may still be arriving, so look again once it has settled
    const t = setTimeout(place, 420);
    return () => clearTimeout(t);
  }, [p, place]);
  useEffect(() => {
    const ro = new ResizeObserver(place);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [place]);

  function jump(i) {
    setP(actEnd[i]);
    setPlaying(false);
  }

  const people = [
    { img: "/profile2.svg", name: "Lena Kovač", rating: "4.8", quote: "$1,800, 3 weeks", key: "profile" },
    { img: "/profile1.svg", name: "Mei Tanaka", rating: "5.0", quote: "$2,100, 2 weeks" },
    { img: "/profile2.svg", name: "Aarav Mehta", rating: "4.9", quote: "$1,700, 4 weeks" },
  ];
  const milestones = [
    ["Design system", "$400"],
    ["Wallet integration", "$900"],
    ["Launch and handover", "$500"],
  ];
  const pressing = !!ph.press;
  const btn = (on, extra = "") => `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-500 ${on ? "bg-gold/15 text-gold" : "bg-gold text-poster"} ${extra}`;
  const press = (k) => ({ animate: { scale: ph.aim === k && pressing ? 0.92 : 1 }, transition: { duration: 0.15 } });

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-[#120e0e] shadow-[0_40px_100px_-50px_rgb(0_0_0/0.9)]">
      {/* the three acts, the current one filling as it plays */}
      <ol className="grid grid-cols-3 border-b border-line">
        {acts.map((a, i) => {
          const span = actEnd[i] - actStart[i] + 1;
          const done = act > i ? 1 : act === i ? (p - actStart[i] + 1) / span : 0;
          return (
            <li key={a.short}>
              <button type="button" onClick={() => jump(i)} aria-current={act === i ? "step" : undefined} className="group relative w-full px-3 pb-3.5 pt-4 text-left sm:px-6">
                <span className={`flex items-center gap-2 text-sm font-semibold ${act === i ? "text-ink" : act > i ? "text-ink-soft" : "text-muted group-hover:text-ink-soft"}`}>
                  <span className={`poster-title flex h-7 w-6 shrink-0 items-center justify-center text-sm ${act >= i ? "bg-gold text-poster" : "bg-white/[0.06] text-muted"}`}>{["I", "II", "III"][i]}</span>
                  <span className="hidden sm:inline">{a.short}</span>
                </span>
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/[0.06]">
                  <m.span className="block h-full origin-left bg-gold" initial={false} animate={{ scaleX: done }} transition={{ duration: act === i && playing ? ph.ms / 1000 : 0.3, ease: "linear" }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="p-3 sm:p-6">
        {/* a small browser window of the site */}
        <div ref={box} aria-hidden="true" className="relative select-none overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line bg-[#171313] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e8655a]" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#8cc2ad]" />
            <span className="ml-3 truncate rounded-md bg-paper/70 px-3 py-1 text-xs text-muted">{acts[act].url}</span>
          </div>

          <div className="relative min-h-[27rem] p-4 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              {act === 0 && (
                <m.div key="post" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }} className="space-y-3">
                  <p className="poster-title text-3xl">Post a job</p>
                  <div>
                    <p className="mb-1 text-xs text-muted">Job title</p>
                    <p className={`${field} min-h-9 font-medium`}>
                      <Typed text="Token vesting dashboard" active={now("typeTitle")} done={p > at("typeTitle")} ms={phases[at("typeTitle")].ms} />
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted">Description</p>
                    <p className={`${field} min-h-[3.6rem] text-ink-soft`}>
                      <Typed text="A React dashboard that reads vesting schedules from our contract and lets holders claim unlocked tokens." active={now("typeDesc")} done={p > at("typeDesc")} ms={phases[at("typeDesc")].ms} />
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted">Milestones</p>
                    <div className="min-h-[7.4rem] space-y-1.5">
                      {milestones.map(([t, v], i) =>
                        past("milestones") ? (
                          <m.p key={t} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: now("milestones") ? i * 0.45 : 0 }} className={`${field} flex justify-between`}>
                            <span>
                              <span className="mr-2 text-muted">{i + 1}</span>
                              {t}
                            </span>
                            <span className="font-medium tabular-nums">{v}</span>
                          </m.p>
                        ) : null,
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-sm text-muted">{past("milestones") ? "Budget $1,800 in USDC" : "Budget"}</span>
                    <m.span ref={reg("publish")} {...press("publish")} className={btn(past("published"))}>
                      <Icon name={past("published") ? "check" : "send"} size={15} />
                      {past("published") ? "Published" : "Publish job"}
                    </m.span>
                  </div>
                  <AnimatePresence>
                    {past("published") && (
                      <m.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-gold/40 bg-[#221c15] px-4 py-2.5 text-sm shadow-xl sm:right-6 sm:top-6">
                        <Icon name="check" size={16} className="text-gold" /> Job published. Open for applications.
                      </m.p>
                    )}
                  </AnimatePresence>
                </m.div>
              )}

              {act === 1 && (
                <m.div key="hire" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="poster-title text-3xl">Token vesting dashboard</p>
                      <p className="text-sm text-muted">Open, $1,800 in 3 milestones</p>
                    </div>
                    <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold">{past("hired") ? "1 hired" : "3 applicants"}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {people.map((x, i) => (
                      <m.div key={x.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: past("profile") && i > 0 ? 0.4 : 1, y: 0 }} transition={{ duration: 0.45, delay: now("arrive") ? i * 0.55 : 0 }} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <img src={x.img} alt="" className="h-10 w-10 shrink-0 rounded-full bg-raised object-cover" style={{ objectPosition: "50% 18%" }} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{x.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Icon name="star" size={11} className="fill-gold text-gold" /> {x.rating}, quoted {x.quote}
                            </span>
                          </span>
                        </span>
                        {x.key ? (
                          <m.span ref={reg("profile")} {...press("profile")} className="shrink-0 rounded-lg border border-[#463a38] px-3 py-1.5 text-xs font-semibold text-ink">
                            View profile
                          </m.span>
                        ) : (
                          <span className="shrink-0 rounded-lg border border-[#463a38] px-3 py-1.5 text-xs font-semibold text-ink-soft">View profile</span>
                        )}
                      </m.div>
                    ))}
                  </div>
                  {/* the profile slides in over the list */}
                  <AnimatePresence>
                    {past("profile") && (
                      <m.div initial={{ x: "105%" }} animate={{ x: 0 }} exit={{ x: "105%" }} transition={{ duration: 0.55, ease }} className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-line bg-[#171313] p-5 shadow-[-30px_0_60px_-30px_rgb(0_0_0/0.9)] sm:w-[58%]">
                        <div className="flex items-center gap-4">
                          <div className="w-20 shrink-0 -rotate-2 border-[3px] border-poster bg-ticket p-1.5">
                            <img src="/profile2.svg" alt="" className="aspect-[4/5] w-full bg-[#e6dcc4] object-cover" style={{ objectPosition: "50% 18%" }} />
                          </div>
                          <div>
                            <p className="text-xl font-semibold">Lena Kovač</p>
                            <p className="text-sm text-ink-soft">Frontend engineer for dapps</p>
                            <p className="mt-1 flex items-center gap-2 text-sm">
                              <Icon name="star" size={13} className="fill-gold text-gold" /> 4.8 <span className="text-muted">31 jobs done, $70/hr</span>
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {["React", "TypeScript", "wagmi", "viem"].map((s) => (
                            <span key={s} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-ink-soft">
                              {s}
                            </span>
                          ))}
                        </div>
                        <p className="mt-4 rounded-xl bg-paper/70 p-3 text-sm text-ink-soft">“I've built two vesting dashboards with wagmi. Design system in week one, claims working by week two.”</p>
                        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                          <span className="text-sm text-muted">Quote $1,800, 3 weeks</span>
                          <m.span ref={reg("hire")} {...press("hire")} className={btn(past("hired"))}>
                            <Icon name="check" size={15} />
                            {past("hired") ? "Hired" : "Hire Lena"}
                          </m.span>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {past("hired") && (
                      <m.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-xl border border-gold/40 bg-[#221c15] px-4 py-2.5 text-sm shadow-xl">
                        <Icon name="check" size={16} className="text-gold" /> Lena is hired. The contract is open.
                      </m.p>
                    )}
                  </AnimatePresence>
                </m.div>
              )}

              {act === 2 && (
                <m.div key="work" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }} className="grid gap-4 md:grid-cols-[1fr_15rem]">
                  {/* the job's chat */}
                  <div className="flex min-h-[23rem] flex-col rounded-xl border border-line bg-paper/60">
                    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                      <img src="/profile2.svg" alt="" className="h-8 w-8 rounded-full bg-raised object-cover" style={{ objectPosition: "50% 18%" }} />
                      <span className="text-sm font-semibold">Lena Kovač</span>
                      <span className="ml-auto text-xs text-muted">Token vesting dashboard</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-end gap-2 p-4 text-sm">
                      {past("sent") && (
                        <m.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#3b2f17] px-3.5 py-2.5">
                          Here's the brief and the designs. Start with the design system.
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {["brief.pdf", "designs.png"].map((f) => (
                              <span key={f} className="inline-flex items-center gap-1 rounded-md bg-black/25 px-2 py-1 text-xs">
                                <Icon name="file" size={12} /> {f}
                              </span>
                            ))}
                          </span>
                        </m.div>
                      )}
                      {past("reply") && (
                        <m.p initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-w-[85%] rounded-2xl rounded-bl-md bg-raised px-3.5 py-2.5">
                          Got them, thanks. Starting today, first delivery on Friday.
                        </m.p>
                      )}
                      {past("delivered") && (
                        <m.p initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="max-w-[85%] rounded-2xl rounded-bl-md bg-raised px-3.5 py-2.5">
                          Design system is done. The link is on the milestone.
                        </m.p>
                      )}
                    </div>
                    {/* the composer */}
                    <div className="border-t border-line p-3">
                      <AnimatePresence>
                        {past("attached") && !past("sent") && (
                          <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 flex gap-1.5">
                            {["brief.pdf", "designs.png"].map((f, i) => (
                              <m.span key={f} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.2 }} className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-xs">
                                <Icon name="file" size={12} className="text-gold" /> {f}
                              </m.span>
                            ))}
                          </m.div>
                        )}
                      </AnimatePresence>
                      <div className="flex items-center gap-2">
                        <m.span ref={reg("attach")} {...press("attach")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#463a38] text-ink-soft">
                          <Icon name="paperclip" size={16} />
                        </m.span>
                        <span className="min-h-9 flex-1 truncate rounded-lg border border-line bg-paper/70 px-3 py-2 text-sm">
                          {past("sent") ? <span className="text-muted">Write a message</span> : <Typed text="Here's the brief and the designs. Start with the design system." active={now("compose")} done={p > at("compose")} ms={phases[at("compose")].ms} />}
                        </span>
                        <m.span ref={reg("send")} {...press("send")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold text-poster">
                          <Icon name="send" size={15} />
                        </m.span>
                      </div>
                    </div>
                  </div>

                  {/* the milestone the work is for */}
                  <div className="flex flex-col gap-3">
                    <div className={`rounded-xl border p-4 transition-colors duration-700 ${past("completed") ? "border-gold/50 bg-gold/[0.06]" : "border-line bg-paper/60"}`}>
                      <p className="text-xs text-muted">Milestone 1 of 3</p>
                      <p className="font-semibold">Design system</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-lg font-semibold tabular-nums">$400</span>
                        <AnimatePresence mode="popLayout" initial={false}>
                          <m.span key={past("completed") ? "paid" : past("delivered") ? "review" : "escrow"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${past("completed") ? "bg-gold/15 text-gold" : past("delivered") ? "bg-amber-200/40 text-amber-800" : "bg-[#8fb8f0]/15 text-[#b4d0f6]"}`}>
                            {past("completed") ? "Paid" : past("delivered") ? "In review" : "In escrow"}
                          </m.span>
                        </AnimatePresence>
                      </div>
                      {past("delivered") && (
                        <m.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 flex items-center gap-1.5 overflow-hidden rounded-md bg-white/[0.06] px-2 py-1.5 text-xs text-ink-soft">
                          <Icon name="link" size={12} /> vesting-dashboard-v1.zip
                        </m.p>
                      )}
                      <div className="mt-3">
                        <m.span ref={reg("approve")} {...press("approve")} className={`${btn(past("completed"), "w-full justify-center")} ${past("delivered") ? "" : "opacity-40"}`}>
                          <Icon name="check" size={15} />
                          {past("completed") ? "Approved" : "Approve and release"}
                        </m.span>
                      </div>
                    </div>
                    <AnimatePresence>
                      {past("completed") && (
                        <m.div initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }} className="rounded-xl border border-gold/40 bg-[#221c15] p-4 text-center">
                          <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }} className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gold text-poster">
                            <Icon name="check" size={20} />
                          </m.span>
                          <p className="mt-2 font-semibold">Work completed</p>
                          <p className="text-sm text-ink-soft">$392 paid to Lena</p>
                          <p className="text-xs text-muted">$8 fee, 2%, on payout</p>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>

          {/* the pointer */}
          {ptr && !reduce && (
            <m.div className="pointer-events-none absolute left-0 top-0 z-30" initial={false} animate={{ x: ptr.x, y: ptr.y, scale: pressing ? 0.8 : 1 }} transition={{ x: { duration: 0.85, ease }, y: { duration: 0.85, ease }, scale: { duration: 0.15 } }}>
              <svg width="24" height="24" viewBox="0 0 24 24" className="drop-shadow-[0_3px_6px_rgb(0_0_0/0.7)]">
                <path d="M4 2.5 19.5 12l-7 1.6L9.4 20.5Z" fill="#f3ece2" stroke="#1b1214" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              {pressing && <m.span className="absolute -left-1 -top-1 h-7 w-7 rounded-full border-2 border-gold" initial={{ opacity: 0.9, scale: 0.5 }} animate={{ opacity: 0, scale: 2.4 }} transition={{ duration: 0.6 }} />}
            </m.div>
          )}
        </div>
      </div>

      {/* subtitles and controls */}
      <div className="flex flex-col gap-4 border-t border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-h-[3.5rem]" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Act {["I", "II", "III"][act]}: {acts[act].short}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <m.p key={captions[ph.id]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="mt-1 text-lg font-semibold text-ink">
              {captions[ph.id]}
            </m.p>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!reduce && (
            <button type="button" onClick={() => setPlaying(!playing)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3d3332] px-4 text-sm font-medium text-ink-soft hover:border-[#6a5a55] hover:text-ink">
              <Icon name={playing ? "pause" : "play"} size={16} />
              {playing ? "Pause" : "Play"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (reduce) jump((act + 1) % 3);
              else {
                setP(0);
                setPlaying(true);
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <Icon name={reduce ? "arrow" : "refresh"} size={16} /> {reduce ? "Next act" : "Replay"}
          </button>
        </div>
      </div>
    </div>
  );
}
