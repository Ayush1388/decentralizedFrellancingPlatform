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
  resolved: ["shield", (e) => `The dispute on “${e.detail}” was settled`],
  cancelled: ["x", (e) => `${who(e)} cancelled the job`],
  completed: ["check", () => "Every milestone is settled. Job complete."],
  reviewed: ["star", (e) => `${who(e)} left a ${e.detail} review`],
  review_reply: ["chat", (e) => `${who(e)} replied to a review`],
  edited: ["edit", (e) => `${who(e)} edited the posting`],
  scope_changed: ["edit", (e) => `${who(e)} changed the milestones before funding`],
  followup: ["plus", (e) => `${who(e)} added follow-up work: “${e.detail}”`],
  synced: ["refresh", (e) => e.detail || "Brought in line with the blockchain"],
};

const who = (e) => e.actor?.name || "Someone";
// "Title: note" -> “Title”, with the note shown separately.
const quoteTitle = (d) => `“${d.split(": ")[0]}”`;

export default function Activity({ events }) {
  if (!events?.length) return null;
  return (
    <section className="card p-5" aria-label="Activity">
      <h2 className="text-lg font-semibold">Activity</h2>
      <ol className="mt-3 space-y-3">
        {events.map((e, i) => {
          const [icon, text] = lines[e.kind] || ["clock", () => e.kind];
          const note = (e.kind === "changes_requested" || e.kind === "disputed") && e.detail.includes(": ") ? e.detail.slice(e.detail.indexOf(": ") + 2) : "";
          return (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ink-soft">
                <Icon name={icon} size={12} />
              </span>
              <span className="min-w-0">
                <span className="block">{text(e)}</span>
                {note && <span className="block text-xs italic text-ink-soft">“{note}”</span>}
                <span className="block tabular-nums text-xs text-muted">{timeAgo(e.createdAt)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
