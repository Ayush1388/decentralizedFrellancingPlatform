import { Children, useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { Icon } from "./ui";

export function ViewToggle({ mode, onChange, label = "Layout" }) {
  const group = useId();
  const options = [
    ["swipe", "Swipe"],
    ["list", "List"],
  ];
  return (
    <LayoutGroup id={group}>
      <div role="group" aria-label={label} className="inline-flex gap-1 rounded-lg border border-line bg-surface p-1">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => onChange(id)}
            className={`relative min-h-9 rounded-md px-3.5 text-sm font-medium transition-colors ${mode === id ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            {mode === id && <m.span layoutId="view" className="absolute inset-0 rounded-md bg-white/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative">{text}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

// Slide widths for one, two or four cards in view. Several in view: two on phones, three on tablets.
const widths = {
  1: "w-[88%] snap-center sm:w-[640px] lg:w-[760px]",
  2: "w-[88%] snap-start sm:w-[640px] lg:w-[calc(50%-0.5rem)]",
  4: "w-[calc(50%-0.5rem)] snap-start sm:w-[calc(33.333%-0.667rem)] lg:w-[calc(25%-0.75rem)]",
};
const slideIn = { type: "spring", stiffness: 380, damping: 32 };

// Cards in a row you move through sideways: swipe on a phone, drag with a mouse, or use the arrows or the arrow keys.
// "lead" and "tools" put the page's own summary and controls on the same row as the arrows.
// "resetKey" changes when a filter changes the set, so the row returns to its start.
export default function Carousel({ children, label = "Cards", perView = 1, twoUp = false, lead, tools, resetKey }) {
  const per = twoUp ? 2 : perView;
  const items = Children.toArray(children);
  const track = useRef(null);
  const drag = useRef(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(1);
  const [edge, setEdge] = useState({ start: true, end: false });

  const slides = () => [...(track.current?.children || [])];

  // One card per view: the card closest to the middle. Several per view: the one closest to the left edge.
  const nearest = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    [...el.children].forEach((s, i) => {
      const d = per > 1 ? Math.abs(s.offsetLeft - el.scrollLeft) : Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }, [per]);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
    const first = el.children[0];
    const vis = first ? Math.max(1, Math.round(el.clientWidth / (first.offsetWidth + 16))) : 1;
    setVisible(vis);
    // At the far end the last cards count as the current ones, even when several are in view.
    setIndex(end ? Math.max(0, el.children.length - vis) : nearest());
  }, [nearest]);

  useEffect(() => {
    update();
  }, [items.length, update]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  // A new filter shows a new set: start from the beginning.
  useEffect(() => {
    track.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [resetKey]);

  function go(to) {
    const list = slides();
    const target = list[Math.max(0, Math.min(list.length - 1, to))];
    if (!target || !track.current) return;
    const el = track.current;
    const left = per > 1 ? target.offsetLeft : target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    el.scrollTo({ left, behavior: "smooth" });
  }

  // Arrows move a whole page of cards; steps are taken from where the row actually is.
  const step = (dir) => go(nearest() + dir * (per > 1 ? visible : 1));

  function onKeyDown(e) {
    if (e.key === "ArrowRight") (e.preventDefault(), step(1));
    if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
  }

  // Touch and trackpads scroll natively. A mouse drags the row, and a drag never counts as a click on a card.
  function onPointerDown(e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false, dx: 0, start: nearest() };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    d.dx = dx;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      track.current.style.scrollSnapType = "none";
      track.current.style.scrollBehavior = "auto";
      track.current.style.cursor = "grabbing";
      // Dragging across text would otherwise select it.
      track.current.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
    }
    if (d.moved) track.current.scrollLeft = d.left - dx;
  }
  function endDrag() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = track.current;
    el.style.cursor = "";
    el.style.userSelect = "";
    el.style.scrollBehavior = "";
    if (d.moved) {
      // Settle on the card the drag ended nearest to, then hand snapping back to the browser.
      let target = nearest();
      // A short flick still moves one card.
      if (target === d.start && Math.abs(d.dx) > 60) target = d.start + (d.dx < 0 ? 1 : -1);
      go(target);
      setTimeout(() => {
        el.style.scrollSnapType = "";
        update();
      }, 450);
      // The click that follows a drag would open a card, so swallow it once.
      const stop = (ev) => (ev.stopPropagation(), ev.preventDefault());
      el.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
    }
  }

  if (items.length === 0) return null;
  const many = per > 1 && visible > 1 && items.length > 1;
  const shown = many ? `${index + 1}–${Math.min(index + visible, items.length)} of ${items.length}` : `${index + 1} of ${items.length}`;
  const pages = per > 1 ? Math.ceil(items.length / visible) : items.length;
  const page = per > 1 ? Math.min(pages - 1, Math.ceil(index / visible)) : index;
  const counter = (
    <p className="px-1 text-sm tabular-nums text-muted" aria-live="polite">
      {shown}
    </p>
  );
  const arrow = "flex h-11 w-11 items-center justify-center rounded-lg border border-[#3d3332] text-ink-soft transition-colors hover:border-[#6a5a55] hover:text-ink disabled:opacity-30 disabled:hover:border-[#3d3332] disabled:hover:text-ink-soft";
  return (
    <section aria-roledescription="carousel" aria-label={label} className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {lead ?? counter}
        <div className="flex items-center gap-2">
          {tools}
          {lead && counter}
          <button type="button" onClick={() => step(-1)} disabled={edge.start} aria-label="Previous cards" className={arrow}>
            <Icon name="arrow" size={16} className="rotate-180" />
          </button>
          <button type="button" onClick={() => step(1)} disabled={edge.end} aria-label="Next cards" className={arrow}>
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>

      <m.div
        ref={track}
        layoutScroll
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={update}
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className="no-scrollbar relative flex cursor-grab snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth rounded-xl py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((child, i) => (
            <m.div
              key={child.key ?? i}
              layout="position"
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
              transition={slideIn}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              className={`flex shrink-0 [&>*]:min-w-0 [&>*]:flex-1 ${widths[per] || widths[1]}`}
            >
              {child}
            </m.div>
          ))}
        </AnimatePresence>
      </m.div>

      <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: Math.min(pages, 12) }).map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === page ? "w-6 bg-gold" : "w-1.5 bg-white/20"}`} />
        ))}
      </div>
    </section>
  );
}
