import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LayoutGroup, m } from "motion/react";

const glide = { type: "spring", stiffness: 420, damping: 34 };

// A row of choices where the gold highlight glides to the one you pick. On narrow screens the row scrolls sideways,
// and its edges fade while there is more to see in that direction.
export default function FilterChips({ options, value, onChange, label, className = "" }) {
  const group = useId();
  const row = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
  }, [measure, options.length]);

  const mask = `linear-gradient(to right, ${fade.left ? "transparent, black 2.5rem" : "black"}, ${fade.right ? "black calc(100% - 2.5rem), transparent" : "black"})`;
  return (
    <LayoutGroup id={group}>
      <div
        ref={row}
        role="group"
        aria-label={label}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className={`no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 ${className}`}
      >
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.id)}
              className={`relative min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-medium transition-colors duration-200 ${on ? "text-poster" : "text-ink-soft ring-1 ring-inset ring-[#3d3332] hover:text-ink hover:ring-[#6a5a55]"}`}
            >
              {on && <m.span layoutId="chip" className="absolute inset-0 rounded-full bg-gold" transition={glide} />}
              <span className="relative">
                {o.label}
                {o.count != null && <span className={`ml-1.5 tabular-nums ${on ? "text-poster/65" : "text-muted"}`}>{o.count}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
