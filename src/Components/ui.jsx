import { Link } from "react-router-dom";
import { imageUrl } from "../lib/api";

// ---------- Icons (inline SVG, 24px grid, 1.8 stroke) ----------
const paths = {
  shield: "M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Zm-3 9 2.2 2.2L15.5 10",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  coins: "M12 6c4 0 7-1 7-2.5S16 1 12 1 5 2 5 3.5 8 6 12 6Zm-7-2.5v5C5 10 8 11 12 11s7-1 7-2.5v-5M5 8.5v5C5 15 8 16 12 16s7-1 7-2.5v-5M5 13.5v5C5 20 8 21 12 21s7-1 7-2.5v-5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  search: "m21 21-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Zm14 6h2",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  chat: "M4 5h16v11H9l-5 4V5Z",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  send: "m21 3-9.5 18-2.2-7.8L3 11l18-8ZM9.3 13.2 21 3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z",
  eth: "M12 2 5 12.2 12 16l7-3.8L12 2Zm0 20 7-9.6L12 16l-7-3.6L12 22Z",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  sliders: "M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4",
  arrowUpRight: "M7 17 17 7M8 7h9v9",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  github: "M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6m0-17a4 4 0 0 1 0 8m6 9c0-2.6-1.9-4.8-4.5-5.6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bell: "M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5L6 17Zm4 2a2 2 0 0 0 4 0",
  bookmark: "M7 4h10v16l-5-3.5L7 20V4Z",
  paperclip: "m20 11-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  copy: "M8 8h11v12H8zM5 16V4h11",
  flag: "M5 21V4m0 1h12l-2 4 2 4H5",
  refresh: "M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4M20 4v5h-5M4 20v-5h5",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9h.01",
  printer: "M7 8V4h10v4M7 17H5v-7h14v7h-2M7 14h10v6H7z",
};

export function Icon({ name, size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={paths[name]} />
    </svg>
  );
}

// ---------- Buttons ----------
// Interface controls are soft and sentence case; only printed things (posters, the ticket) are sharp.
const base =
  "inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg text-[0.9375rem] font-medium whitespace-nowrap transition-[filter,background-color,color,border-color] duration-150 disabled:opacity-50 disabled:pointer-events-none";
const variants = {
  primary: "bg-gold text-poster font-semibold hover:brightness-110",
  secondary: "border border-[#463a38] text-ink hover:border-[#6a5a55] hover:bg-white/[0.04]",
  outline: "border border-[#463a38] text-ink hover:border-[#6a5a55] hover:bg-white/[0.04]",
  ghost: "text-ink-soft hover:bg-white/[0.05] hover:text-ink",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
  dark: "bg-poster text-ticket font-semibold hover:bg-black",
  light: "border border-poster/35 text-poster hover:bg-poster/5",
  solidLight: "bg-gold text-poster font-semibold hover:brightness-110",
};

export function Button({ variant = "primary", size, className = "", loading, children, to, ...props }) {
  const cls = `${base} ${variants[variant]} ${size === "sm" ? "!min-h-9 !px-3.5 !text-sm" : ""} ${className}`;
  if (to) {
    return (
      <Link to={to} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function IconButton({ icon, label, tone = "white", size = 44, className = "", to, ...props }) {
  const toneCls = {
    white: "border border-[#3d3332] text-ink-soft hover:border-[#6a5a55] hover:text-ink",
    sage: "border border-[#3d3332] bg-surface text-ink-soft hover:border-[#6a5a55] hover:text-ink",
    ink: "bg-gold text-poster hover:brightness-110",
    outline: "border border-current/40 hover:border-[#6a5a55] hover:text-ink",
  }[tone];
  const cls = `inline-flex shrink-0 items-center justify-center rounded-lg transition-colors ${toneCls} ${className}`;
  const style = { width: size, height: size };
  if (to)
    return (
      <Link to={to} aria-label={label} title={label} className={cls} style={style} {...props}>
        <Icon name={icon} size={18} />
      </Link>
    );
  return (
    <button type="button" aria-label={label} title={label} className={cls} style={style} {...props}>
      <Icon name={icon} size={18} />
    </button>
  );
}

// ---------- Small pieces ----------
// Status pills: tinted, never wrapping, distinct in shape from buttons.
const tones = {
  green: "bg-gold/12 text-gold",
  amber: "bg-amber-200/40 text-amber-800",
  red: "bg-red-300/30 text-red-700",
  blue: "bg-[#8fb8f0]/15 text-[#b4d0f6]",
  gray: "bg-white/[0.07] text-ink-soft",
  violet: "bg-violet-900/15 text-violet-900",
};

export function Badge({ tone = "gray", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SkillChip({ children }) {
  return <span className="whitespace-nowrap rounded-md bg-white/[0.06] px-2 py-0.5 text-[0.8125rem] text-ink-soft">{children}</span>;
}

// Falls back to one of the two bundled profile illustrations, picked by seed so a person keeps the same face.
export function Avatar({ src, seed = 0, size = 48 }) {
  const url = imageUrl(src) || `/profile${(Math.abs(Number(seed) || 0) % 2) + 1}.svg`;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-raised object-cover ring-1 ring-white/10"
      style={{ width: size, height: size, objectPosition: "50% 18%" }}
    />
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      <Icon name="alert" size={18} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

// An empty list is an invitation to act: say what belongs here and offer the way to add it.
export function EmptyState({ icon = "briefcase", title, children, action, as = "h3" }) {
  const Heading = as;
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-[#3d3332] px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold">
        <Icon name={icon} size={22} />
      </span>
      <Heading className="text-xl font-semibold text-ink">{title}</Heading>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// The title of an inner page: one poster line, a plain sentence, and the page's main action on the right.
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-8 mt-8 flex flex-col gap-5 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="poster-title text-5xl text-ink sm:text-6xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-ink-soft">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardSkeleton({ className = "h-64" }) {
  return <div className={`animate-pulse rounded-xl bg-surface ${className}`} aria-hidden="true" />;
}

// ---------- Layout primitives shared by every page ----------

export function SectionHeader({ title, subtitle, align = "center", id }) {
  return (
    <header className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : "text-left"}`}>
      <h2 id={id} className="poster-title text-4xl text-ink sm:text-5xl">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-lg text-ink-soft">{subtitle}</p>}
    </header>
  );
}

export function Section({ children, className = "", ...props }) {
  return (
    <section className={`container-page pt-16 sm:pt-24 ${className}`} {...props}>
      {children}
    </section>
  );
}

// Underlined tabs: the current one carries a gold rule, the others recede. Scrolls sideways on narrow screens.
export function Tabs({ tabs, value, onChange, label, className = "" }) {
  return (
    <div role="tablist" aria-label={label} className={`no-scrollbar flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 pb-2 font-medium transition-colors ${value === t.id ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 tabular-nums text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
