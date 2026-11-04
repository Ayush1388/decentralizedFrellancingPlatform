// Dates written the way a ticket stub prints them: 25 · X · 2026. Only the ticket uses this; the interface says "3 days ago".
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const reelDate = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} · ${roman[d.getMonth()]} · ${d.getFullYear()}`;
};

// Each kind of work is printed on its own poster stock, so the board reads like a wall of different one-sheets.
// Every stock keeps the dark poster ink readable (4.5:1 or better at poster sizes).
const stocks = {
  "Smart contracts": "#f2c230",
  Frontend: "#f1e7cf",
  Backend: "#8cc2ad",
  "Full stack": "#f0a35a",
  Design: "#eeb1a7",
  "Security and audits": "#e8655a",
  "Data and indexing": "#9dbde6",
  DevOps: "#c3b2e6",
  "Writing and docs": "#e3cf9f",
};
export const posterStock = (category) => stocks[category] || "#f2c230";

// The escrow rules in plain words.
export const houseRules = [
  ["Free to post and apply", "No listing fee and no subscription."],
  ["Paid on approval", "Each milestone is released when the client approves the work."],
  ["Seven-day safety net", "If the client goes quiet after a delivery, the developer can claim the payment."],
  ["2% fee, on payouts only", "Taken from the developer's share when a milestone is paid."],
];
