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
  "inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-full text-[0.95rem] font-medium transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none";
const variants = {
  primary: "bg-ink text-white hover:bg-ink-soft",
  secondary: "bg-sage text-ink hover:bg-[#c3cec5]",
  outline: "border border-ink/20 text-ink hover:bg-white",
  ghost: "text-ink hover:bg-sage",
  danger: "bg-blush text-red-900 hover:bg-[#f0b0b2]",
  dark: "bg-ink text-white hover:bg-ink-soft",
  light: "border border-white/30 text-white hover:bg-white/10",
  solidLight: "bg-white text-ink hover:bg-paper",
};

export function Button({ variant = "primary", size, className = "", loading, children, to, ...props }) {
  const cls = `${base} ${variants[variant]} ${size === "sm" ? "!min-h-9 !px-4 text-sm" : ""} ${className}`;
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
    white: "bg-white text-ink hover:bg-paper",
    sage: "bg-sage text-ink hover:bg-[#c3cec5]",
    ink: "bg-ink text-white hover:bg-ink-soft",
    outline: "border border-current/30 hover:bg-white/40",
  }[tone];
  const cls = `inline-flex shrink-0 items-center justify-center rounded-full transition-colors ${toneCls} ${className}`;
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
  green: "bg-mint text-green-900",
  amber: "bg-butter text-amber-950",
  red: "bg-blush text-red-900",
  blue: "bg-sky text-sky-950",
  gray: "bg-sage text-ink-soft",
  violet: "bg-violet-100 text-violet-900",
};

export function Badge({ tone = "gray", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SkillChip({ children }) {
  return (
    <span className="rounded-full border border-line bg-white/60 px-3 py-0.5 text-xs text-ink-soft">{children}</span>
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
      className="shrink-0 rounded-full bg-sand object-cover ring-2 ring-white"
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
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-blush px-4 py-3 text-sm text-red-950">
      <Icon name="alert" size={18} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ icon = "briefcase", image, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-white px-6 py-12 text-center">
      {image ? (
        <img src={image} alt="" width="180" height="180" className="mb-2 h-36 w-auto" />
      ) : (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-ink">
          <Icon name={icon} size={22} />
        </span>
      )}
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, image, eyebrow = "Overview" }) {
  return (
    <div className="mb-8 mt-8 grid gap-4 md:grid-cols-[1fr_auto]">
      <div className="tile flex flex-col justify-between bg-white sm:p-8">
        <div>
          <p className="stat-label">{eyebrow}</p>
          <h1 className="mt-1 text-4xl font-semibold sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-3 max-w-xl text-muted">{subtitle}</p>}
        </div>
        {action && <div className="mt-6">{action}</div>}
      </div>
      {image && (
        <div className="tile hidden w-64 items-center justify-center bg-sage md:flex lg:w-72">
          <img src={image} alt="" width="220" height="220" className="h-44 w-full object-contain lg:h-48" />
        </div>
      )}
    </div>
  );
}

export function CardSkeleton({ className = "h-64" }) {
  return <div className={`animate-pulse rounded-3xl bg-white/60 ${className}`} aria-hidden="true" />;
}

// ---------- Layout primitives shared by every page ----------

// Every illustration sits in the same tinted rounded panel so artwork from different packs reads as one set.
export function IllustrationPanel({ src, alt = "", className = "", imgClass = "", children }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-3xl bg-white ${className}`}>
      {src && <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-contain p-4 sm:p-6 ${imgClass}`} />}
      {children}
    </div>
  );
}

// Eyebrow + heading + subtext. Same on every section so the page has one rhythm.
export function SectionHeader({ eyebrow, title, subtitle, align = "center", id }) {
  return (
    <header className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : "text-left"}`}>
      {eyebrow && <p className="stat-label">{eyebrow}</p>}
      <h2 id={id} className="mt-1 text-3xl font-semibold sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-lg text-muted">{subtitle}</p>}
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
