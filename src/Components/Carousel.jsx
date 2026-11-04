import { Children, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export function ViewToggle({ mode, onChange, label = "Layout" }) {
  const options = [
    ["swipe", "Swipe", "arrow"],
    ["list", "List", "menu"],
  ];
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={`min-h-9 rounded-md px-3.5 text-sm font-medium transition-colors ${mode === id ? "bg-white/10 text-ink" : "text-muted hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

// Cards in a row you move through sideways: swipe on a phone, drag with a mouse, or use the arrows or the arrow keys.
// With twoUp, two cards sit side by side on wide screens (one per view on narrower ones).
// "lead" and "tools" put the page's own summary and controls on the same row as the arrows.
export default function Carousel({ children, label = "Cards", twoUp = false, lead, tools }) {
  const items = Children.toArray(children);
  const track = useRef(null);
  const drag = useRef(null);
  const [index, setIndex] = useState(0);
  const [edge, setEdge] = useState({ start: true, end: false });

  const slides = () => [...(track.current?.children || [])];

  // One card per view: the card closest to the middle. Two per view: the one closest to the left edge.
  const nearest = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    [...el.children].forEach((s, i) => {
      const d = twoUp ? Math.abs(s.offsetLeft - el.scrollLeft) : Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }, [twoUp]);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
    // At the far end the last card counts as the current one, even when two cards are in view.
    setIndex(end ? el.children.length - 1 : nearest());
  }, [nearest]);

  useEffect(() => {
    update();
  }, [items.length, update]);

  function go(to) {
    const list = slides();
    const target = list[Math.max(0, Math.min(list.length - 1, to))];
    if (!target || !track.current) return;
    const el = track.current;
    const left = twoUp ? target.offsetLeft : target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    el.scrollTo({ left, behavior: "smooth" });
  }

  // Steps are taken from where the row actually is, so they still work at the far end where the counter shows the last card.
  const step = (dir) => go(nearest() + dir);

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
        el.style.scrollBehavior = "";
        update();
      }, 450);
      // The click that follows a drag would open a card, so swallow it once.
      const stop = (ev) => (ev.stopPropagation(), ev.preventDefault());
      el.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
    }
  }

  if (items.length === 0) return null;
  return (
    <section aria-roledescription="carousel" aria-label={label} className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {lead ?? (
          <p className="text-sm tabular-nums text-muted" aria-live="polite">
            {index + 1} of {items.length}
          </p>
        )}
        <div className="flex items-center gap-2">
          {tools}
          {lead && (
            <p className="px-1 text-sm tabular-nums text-muted" aria-live="polite">
              {index + 1} of {items.length}
            </p>
          )}
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={edge.start}
            aria-label="Previous card"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#3d3332] text-ink-soft transition-colors hover:border-[#6a5a55] hover:text-ink disabled:opacity-30 disabled:hover:border-[#3d3332] disabled:hover:text-ink-soft"
          >
            <Icon name="arrow" size={16} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={edge.end}
            aria-label="Next card"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#3d3332] text-ink-soft transition-colors hover:border-[#6a5a55] hover:text-ink disabled:opacity-30 disabled:hover:border-[#3d3332] disabled:hover:text-ink-soft"
          >
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>

      <div
        ref={track}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={update}
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className="no-scrollbar flex cursor-grab snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth py-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        {items.map((child, i) => (
          <div
            key={child.key ?? i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className={`flex shrink-0 [&>*]:min-w-0 [&>*]:flex-1 ${twoUp ? "w-[88%] snap-start sm:w-[640px] lg:w-[calc(50%-0.5rem)]" : "w-[88%] snap-center sm:w-[640px] lg:w-[760px]"}`}
          >
            {child}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
        {items.slice(0, 12).map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-gold" : "w-1.5 bg-white/20"}`} />
        ))}
      </div>
    </section>
  );
}
