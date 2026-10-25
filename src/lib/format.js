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
