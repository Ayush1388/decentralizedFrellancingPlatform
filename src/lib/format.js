// USDC amounts travel as integer base units (6 decimals).
export const toUsdc = (units) => Number(units) / 1_000_000;

export function usdc(units, { compact = false } = {}) {
  const n = toUsdc(units);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) || compact ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const units = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2592000, "month"],
  ];
  let out = "just now";
  for (const [secs, name] of units) {
    if (s >= secs) {
      const n = Math.floor(s / secs);
      out = `${n} ${name}${n > 1 ? "s" : ""} ago`;
    }
  }
  return out;
}

export const shortDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const splitSkills = (s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const DAY = 86_400_000;

// "Closes in 5 days", "Closes today", "Closed": how long a posting still takes applications.
export function closesIn(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Applications closed";
  const days = Math.ceil(ms / DAY);
  return days <= 1 ? "Closes today" : `Closes in ${days} days`;
}

export const isClosed = (job) => job.status !== "open" || (job.closesAt && new Date(job.closesAt).getTime() <= Date.now());

// "1 of 2 filled" style summary of a posting's openings.
export const openingsLabel = (job) =>
  job.openings > 1 ? `${job.hired} of ${job.openings} openings filled` : job.hired ? "Position filled" : "1 opening";

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
