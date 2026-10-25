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
const base =
  "inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-[2px] text-[0.72rem] font-semibold uppercase tracking-[0.2em] transition-[filter,background-color,color,border-color] duration-200 disabled:opacity-50 disabled:pointer-events-none";
const variants = {
  primary: "bg-gold text-poster hover:brightness-110",
  secondary: "border border-gold text-gold hover:bg-gold/10",
  outline: "border border-[#3a3733] text-ink hover:border-gold hover:text-gold",
  ghost: "text-gold hover:bg-white/5",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
  dark: "bg-poster text-ticket hover:bg-black",
  light: "border border-ink/40 text-ink hover:border-gold hover:text-gold",
  solidLight: "bg-gold text-poster hover:brightness-110",
};

export function Button({ variant = "primary", size, className = "", loading, children, to, ...props }) {
  const cls = `${base} ${variants[variant]} ${size === "sm" ? "!min-h-9 !px-3.5 !text-[0.66rem]" : ""} ${className}`;
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

// Round icon button, as in the reference's toolbar circles.
export function IconButton({ icon, label, tone = "white", size = 44, className = "", to, ...props }) {
  const toneCls = {
    white: "border border-[#3a3733] text-ink hover:border-gold hover:text-gold",
    sage: "border border-[#3a3733] bg-surface text-ink hover:border-gold hover:text-gold",
    ink: "bg-gold text-poster hover:brightness-110",
    outline: "border border-current/40 hover:border-gold hover:text-gold",
  }[tone];
  const cls = `inline-flex shrink-0 items-center justify-center rounded-[2px] transition-colors ${toneCls} ${className}`;
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
const tones = {
  green: "border-gold text-gold",
  amber: "border-amber-800 text-amber-800",
  red: "border-red-700 text-red-700",
  blue: "border-[#8fb8f0] text-[#a9c9f5]",
  gray: "border-[#4a4640] text-muted",
  violet: "border-violet-900 text-violet-900",
};

export function Badge({ tone = "gray", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[0.75rem] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SkillChip({ children }) {
  return (
    <span className="border border-line px-2 py-0.5 font-mono text-[0.75rem] text-ink-soft">{children}</span>
  );
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
      className="shrink-0 rounded-full bg-surface object-cover ring-1 ring-gold/50"
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
    <p role="alert" className="flex items-start gap-2 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      <Icon name="alert" size={18} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ icon = "briefcase", image, title, children, action }) {
  return (
    <div className="flex flex-col items-center border border-dashed border-[#3a3733] bg-surface px-6 py-12 text-center">
      {image ? (
        <img src={image} alt="" width="180" height="180" className="mb-4 h-36 w-auto bg-ticket p-2 sepia-[.35]" />
      ) : (
        <span className="mb-4 flex h-12 w-12 items-center justify-center border border-gold text-gold">
          <Icon name={icon} size={22} />
        </span>
      )}
      <h3 className="poster-title text-3xl text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Every inner page opens like a programme card: label, poster title, a framed still.
export function PageHeader({ title, subtitle, action, image, eyebrow = "Now showing" }) {
  return (
    <div className="mb-10 mt-10 grid items-end gap-8 border-b border-gold/35 pb-8 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h1 className="poster-title mt-3 text-6xl text-gold sm:text-7xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-xl text-lg text-ink-soft">{subtitle}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
      {image && (
        <div className="hidden -rotate-2 border-[3px] border-poster bg-gold p-2 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] md:block">
          <div className="bg-ticket">
            <img src={image} alt="" width="220" height="220" className="h-40 w-52 object-contain p-2 sepia-[.35]" />
          </div>
        </div>
      )}
    </div>
  );
}

export function CardSkeleton({ className = "h-64" }) {
  return <div className={`animate-pulse bg-surface ${className}`} aria-hidden="true" />;
}

// ---------- Layout primitives shared by every page ----------

// Every illustration sits in the same tinted rounded panel so artwork from different packs reads as one set.
export function IllustrationPanel({ src, alt = "", className = "", imgClass = "", children }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-ticket ${className}`}>
      {src && <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-contain p-4 sm:p-6 ${imgClass}`} />}
      {children}
    </div>
  );
}

// Eyebrow + heading + subtext. Same on every section so the page has one rhythm.
export function SectionHeader({ eyebrow, title, subtitle, align = "center", id }) {
  return (
    <header className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : "text-left"}`}>
      {eyebrow && <p className="eyebrow text-gold">{eyebrow}</p>}
      <h2 id={id} className="poster-title mt-3 text-5xl text-ink sm:text-6xl">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-lg text-ink-soft">{subtitle}</p>}
    </header>
  );
}

export function Section({ children, className = "", ...props }) {
  return (
    <section className={`container-page pt-20 sm:pt-28 ${className}`} {...props}>
      {children}
    </section>
  );
}
