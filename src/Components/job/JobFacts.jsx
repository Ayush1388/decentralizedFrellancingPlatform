import { closesIn, isClosed, openingsLabel, plural } from "../../lib/format";
import { Icon } from "../ui";

// The numbers an applicant asks first: how many applied, how many spots, how long it stays open.
export default function JobFacts({ job, className = "" }) {
  const facts = [
    { icon: "users", text: `${plural(job.applicants, "applicant")}` },
    { icon: "briefcase", text: openingsLabel(job) },
    job.status === "open" && job.closesAt && { icon: "clock", text: closesIn(job.closesAt), warn: isClosed(job) },
    job.duration && { icon: "calendar", text: job.duration },
    job.level && { icon: "star", text: `${job.level} level` },
  ].filter(Boolean);
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.8rem] ${className}`}>
      {facts.map((f) => (
        <li key={f.text} className={`flex items-center gap-1.5 ${f.warn ? "text-red-700" : "text-ink-soft"}`}>
          <Icon name={f.icon} size={14} className="text-gold" /> {f.text}
        </li>
      ))}
    </ul>
  );
}
