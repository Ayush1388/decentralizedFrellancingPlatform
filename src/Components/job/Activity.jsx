import { timeAgo } from "../../lib/format";
import { Icon } from "../ui";

// Plain-English lines for the job's activity log.
const lines = {
  posted: ["plus", (e) => `${who(e)} posted the job`],
  applied: ["users", (e) => `${e.detail || who(e)} applied`],
  withdrew: ["x", (e) => `${who(e)} withdrew their application`],
  shortlisted: ["star", (e) => `${e.detail} was shortlisted`],
  declined: ["x", (e) => `${e.detail} was declined`],
  hired: ["check", (e) => `${e.detail} was hired`],
  filled: ["briefcase", () => "Every opening is filled"],
  funded: ["lock", (e) => `${who(e)} funded “${e.detail}”`],
  submitted: ["send", (e) => `${who(e)} delivered “${e.detail}”`],
  changes_requested: ["alert", (e) => `${who(e)} asked for changes on ${quoteTitle(e.detail)}`],
  approved: ["coins", (e) => `${who(e)} approved and released “${e.detail}”`],
  claimed: ["coins", (e) => `${who(e)} claimed “${e.detail}” after the review window`],
  refunded: ["coins", (e) => `${who(e)} reclaimed “${e.detail}”`],
  disputed: ["alert", (e) => `${who(e)} opened a dispute on ${quoteTitle(e.detail)}`],
  resolved: ["shield", (e) => `The arbiter ruled on “${e.detail}”`],
  cancelled: ["x", (e) => `${who(e)} cancelled the job`],
  completed: ["check", () => "Every milestone is settled. Job complete."],
  reviewed: ["star", (e) => `${who(e)} left a ${e.detail} review`],
};

const who = (e) => e.actor?.name || "Someone";
// "Title: note" -> “Title”, with the note shown separately.
const quoteTitle = (d) => `“${d.split(": ")[0]}”`;

export default function Activity({ events }) {
  if (!events?.length) return null;
  return (
    <section className="card p-5" aria-label="Activity">
      <h2 className="poster-title text-2xl">Activity</h2>
      <ol className="mt-3 space-y-3">
        {events.map((e, i) => {
          const [icon, text] = lines[e.kind] || ["clock", () => e.kind];
          const note = (e.kind === "changes_requested" || e.kind === "disputed") && e.detail.includes(": ") ? e.detail.slice(e.detail.indexOf(": ") + 2) : "";
          return (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-[#3a3733] text-gold">
                <Icon name={icon} size={12} />
              </span>
              <span className="min-w-0">
                <span className="block">{text(e)}</span>
                {note && <span className="block text-xs italic text-ink-soft">“{note}”</span>}
                <span className="block font-mono text-[11px] text-muted">{timeAgo(e.createdAt)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
