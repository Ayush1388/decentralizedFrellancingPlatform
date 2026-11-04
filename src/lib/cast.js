// Developers do not pick a category, so their specialities are read from their title and skills.
// The names match job categories, so "Frontend jobs" and "Frontend developers" mean the same thing.
const rules = [
  ["Smart contracts", /solidity|smart contract|foundry|hardhat|vyper|\bevm\b|defi|web3|staking/i],
  ["Frontend", /react|front-?end|next\.?js|\bvue\b|svelte|wagmi|viem|dapp/i],
  ["Backend", /back-?end|\bgo\b|golang|node|postgres|\brust\b|python|\bapi\b|server/i],
  ["Full stack", /full[- ]?stack/i],
  ["Design", /design|figma|\bux\b|\bui\b/i],
  ["Security and audits", /audit|security|formal verification|auditor/i],
  ["Data and indexing", /index|subgraph|the graph|\bdata\b|\bsql\b|analytics/i],
  ["DevOps", /devops|docker|kubernetes|infra|terraform|ci\/cd/i],
  ["Writing and docs", /writing|writer|\bdocs\b|documentation/i],
];

export function specialities(dev) {
  const text = [dev.title, ...(dev.skills || [])].join(" ");
  return rules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export const castDefaults = { spec: "all", rating: "any", rate: "any", exp: "any" };

export const ratingOptions = [
  ["any", "Any rating"],
  ["4", "4 stars and up"],
  ["4.5", "4.5 stars and up"],
];
export const rateOptions = [
  ["any", "Any rate"],
  ["0-60", "Under $60/hr"],
  ["60-100", "$60 to $100/hr"],
  ["100-", "Over $100/hr"],
];
export const expOptions = [
  ["any", "Any experience"],
  ["10", "10+ jobs done"],
  ["25", "25+ jobs done"],
];

export function filterCast(devs, f) {
  return devs.filter((d) => {
    if (f.spec !== "all" && !specialities(d).includes(f.spec)) return false;
    if (f.rating !== "any" && !(d.rating > 0 && d.rating >= Number(f.rating))) return false;
    if (f.rate !== "any") {
      const [lo, hi] = f.rate.split("-").map((x) => (x === "" ? null : Number(x)));
      if (lo != null && d.hourlyRate < lo) return false;
      if (hi != null && d.hourlyRate >= hi) return false;
    }
    if (f.exp !== "any" && (d.jobsDone || 0) < Number(f.exp)) return false;
    return true;
  });
}

// "All" plus every kind of work at least one item has, with how many have it.
export function chipOptions(items, kindsOf, allLabel = "All") {
  const counts = new Map();
  for (const it of items) for (const k of kindsOf(it)) counts.set(k, (counts.get(k) || 0) + 1);
  const order = rules.map(([name]) => name);
  const rank = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  const kinds = [...counts.keys()].sort((a, b) => rank(a) - rank(b));
  return [{ id: "all", label: allLabel, count: items.length }, ...kinds.map((k) => ({ id: k, label: k, count: counts.get(k) }))];
}
