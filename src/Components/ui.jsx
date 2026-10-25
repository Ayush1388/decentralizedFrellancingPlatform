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
  "inline-flex items-center justify-center gap-2 min-h-11 px-7 rounded-sm text-[0.72rem] font-medium uppercase tracking-[0.14em] transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none";
const variants = {
  primary: "bg-green-900 text-paper hover:bg-green-700",
  secondary: "bg-transparent text-ink border border-ink/50 hover:bg-ink hover:text-paper",
  ghost: "text-green-800 hover:bg-green-100",
  danger: "bg-transparent text-red-800 border border-red-300 hover:bg-red-50",
  dark: "bg-ink text-white hover:bg-ink-soft",
  light: "bg-transparent text-white border border-white/70 hover:bg-white hover:text-green-950",
  solidLight: "bg-paper text-green-950 hover:bg-white",
};

export function Button({ variant = "primary", size, className = "", loading, children, to, ...props }) {
  const cls = `${base} ${variants[variant]} ${size === "sm" ? "!min-h-9 !px-4 !text-[0.68rem]" : ""} ${className}`;
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

// ---------- Small pieces ----------
const tones = {
  green: "bg-green-100 text-green-900",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-900",
  gray: "bg-sand text-ink-soft",
  violet: "bg-violet-100 text-violet-900",
};

export function Badge({ tone = "gray", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.1em] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SkillChip({ children }) {
  return (
    <span className="rounded-sm border border-line bg-transparent px-2.5 py-0.5 text-xs text-ink-soft">{children}</span>
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
      className="shrink-0 rounded-full bg-sand object-cover ring-1 ring-line"
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
    <p role="alert" className="flex items-start gap-2 rounded-sm border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <Icon name="alert" size={18} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ icon = "briefcase", image, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-sm border border-dashed border-[#c9c3b2] bg-transparent px-6 py-12 text-center">
      {image ? (
        <img src={image} alt="" width="180" height="180" className="mb-2 h-36 w-auto" />
      ) : (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-800">
          <Icon name={icon} size={22} />
        </span>
      )}
      <h3 className="font-serif text-2xl font-medium">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, image, eyebrow }) {
  return (
    <div className="mb-10 mt-10 border-b border-line pb-10">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="min-w-0 flex-1 basis-80">
          {eyebrow && <p className="eyebrow mb-4 text-green-700">{eyebrow}</p>}
          <h1 className="text-5xl sm:text-6xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-xl text-lg text-muted">{subtitle}</p>}
          {action && <div className="mt-7">{action}</div>}
        </div>
        {image && (
          <div className="arch hidden h-44 w-36 shrink-0 items-end justify-center overflow-hidden bg-sand sm:flex lg:h-52 lg:w-44">
            <img src={image} alt="" width="220" height="220" className="h-full w-full object-contain p-3 pt-8" />
          </div>
        )}
      </div>
    </div>
  );
}

export function CardSkeleton({ className = "h-64" }) {
  return <div className={`animate-pulse rounded-sm bg-sand ${className}`} aria-hidden="true" />;
}

// ---------- Layout primitives shared by every page ----------

// Every illustration sits in the same tinted rounded panel so artwork from different packs reads as one set.
export function IllustrationPanel({ src, alt = "", className = "", imgClass = "", children }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-sm bg-sand ${className}`}>
      {src && <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-contain p-4 sm:p-6 ${imgClass}`} />}
      {children}
    </div>
  );
}

// Eyebrow + heading + subtext. Same on every section so the page has one rhythm.
export function SectionHeader({ eyebrow, title, subtitle, align = "center", id }) {
  return (
    <header className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : "text-left"}`}>
      {eyebrow && <p className="eyebrow text-green-700">{eyebrow}</p>}
      <h2 id={id} className="mt-4 text-4xl sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {subtitle && <p className="mt-5 text-lg text-muted">{subtitle}</p>}
    </header>
  );
}

export function Section({ children, className = "", ...props }) {
  return (
    <section className={`container-page pt-24 sm:pt-36 ${className}`} {...props}>
      {children}
    </section>
  );
}
