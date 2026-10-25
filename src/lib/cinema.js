// Dates written the way the programme prints them: 25 · X · 2026.
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const reelDate = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} · ${roman[d.getMonth()]} · ${d.getFullYear()}`;
};

// The escrow rules, in theatre terms.
export const houseRules = [
  ["Admission", "Free to post or apply"],
  ["Intermission", "7 days, then the developer may claim"],
  ["Refunds", "After 14 days with nothing delivered"],
  ["Concessions", "2% fee, only on release"],
];
