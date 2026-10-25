import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useChainConfig } from "../../context/useChainConfig";
import { openingsLabel, plural, timeAgo } from "../../lib/format";
import { appStatus, jobStatus } from "../../lib/jobStatus";
import { Avatar, Badge, Button, ErrorNote, Icon, SkillChip } from "../ui";
import { ProofOfWork, Quote } from "./ApplyPanel";
import Thread from "./Thread";

const filters = [
  { id: "active", label: "To review", match: (a) => a.status === "pending" || a.status === "shortlisted" },
  { id: "shortlisted", label: "Shortlisted", match: (a) => a.status === "shortlisted" },
  { id: "accepted", label: "Hired", match: (a) => a.status === "accepted" },
  { id: "declined", label: "Declined", match: (a) => a.status === "declined" },
];

function Applicant({ a, job, user, onChange }) {
  const chain = useChainConfig();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmHire, setConfirmHire] = useState(false);
  const [talk, setTalk] = useState(false);
  const st = appStatus[a.status];
  const open = job.status === "open";
  const live = open && (a.status === "pending" || a.status === "shortlisted");

  async function run(key, path, body) {
    setBusy(key);
    setError("");
    try {
      onChange(await api(path, { method: "POST", body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
      setConfirmHire(false);
    }
  }
  const setStatus = (status) => run(status, `/api/applications/${a.id}/status`, { status });

  return (
    <li className={`card p-5 ${a.status === "shortlisted" ? "!border-gold/50" : ""} ${a.status === "declined" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Avatar seed={a.user.id} size={44} />
        <div className="min-w-0 flex-1">
          <p className="poster-title text-2xl">{a.user.name}</p>
          {a.developer ? (
            <p className="font-mono text-xs text-muted">
              {a.developer.title} · ${a.developer.hourlyRate}/hr · {a.developer.rating > 0 ? `★ ${a.developer.rating.toFixed(1)}` : "no rating yet"} ·{" "}
              {plural(a.developer.jobsDone, "job")} done
            </p>
          ) : (
            <p className="font-mono text-xs text-muted">No developer profile</p>
          )}
          <p className="mt-0.5 text-xs text-muted">Applied {timeAgo(a.createdAt)}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <Quote app={a} budget={job.total} />
      <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{a.cover}</p>
      <ProofOfWork app={a} />
      {a.developer?.skills?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.developer.skills.slice(0, 5).map((s) => (
            <SkillChip key={s}>{s}</SkillChip>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-white/10 pt-4">
        {live && !confirmHire && (
          <Button size="sm" disabled={chain && !a.hasWallet} onClick={() => setConfirmHire(true)}>
            <Icon name="check" size={14} /> Hire {a.user.name.split(" ")[0]}
          </Button>
        )}
        {confirmHire && (
          <span className="flex flex-wrap items-center gap-2 bg-black/30 px-3 py-2 text-sm">
            {job.openings > 1 ? `Hire for one of ${job.openings} openings?` : "Hire and decline the others?"}
            <Button size="sm" loading={busy === "hire"} onClick={() => run("hire", `/api/jobs/${job.id}/hire`, { applicationId: a.id })}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmHire(false)}>
              Cancel
            </Button>
          </span>
        )}
        {live && a.status === "pending" && (
          <Button size="sm" variant="secondary" loading={busy === "shortlisted"} onClick={() => setStatus("shortlisted")}>
            <Icon name="star" size={14} /> Shortlist
          </Button>
        )}
        {live && a.status === "shortlisted" && (
          <Button size="sm" variant="outline" loading={busy === "pending"} onClick={() => setStatus("pending")}>
            Remove from shortlist
          </Button>
        )}
        {live && (
          <Button size="sm" variant="ghost" loading={busy === "declined"} onClick={() => setStatus("declined")}>
            Decline
          </Button>
        )}
        {open && a.status === "declined" && (
          <Button size="sm" variant="ghost" loading={busy === "pending"} onClick={() => setStatus("pending")}>
            Reconsider
          </Button>
        )}
        {a.status === "accepted" && a.contractId && a.contractId !== job.id && (
          <Button size="sm" to={`/jobs/${a.contractId}`}>
            Open contract <Icon name="arrow" size={14} />
          </Button>
        )}
        {a.status !== "declined" && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setTalk(!talk)} aria-expanded={talk}>
            <Icon name="chat" size={14} /> {talk ? "Hide messages" : a.messages ? `Messages (${a.messages})` : "Message"}
          </Button>
        )}
      </div>
      {chain && !a.hasWallet && live && <p className="mt-2 text-xs text-amber-800">No wallet linked yet, so they cannot be paid on-chain.</p>}
      {talk && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <Thread compact path={`/api/applications/${a.id}/messages`} user={user} empty={`Ask ${a.user.name.split(" ")[0]} anything before you decide.`} />
        </div>
      )}
      <div className="mt-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </li>
  );
}

export default function ApplicantsPanel({ job, user, onChange }) {
  const apps = job.applications || [];
  const [filter, setFilter] = useState("active");
  const f = filters.find((x) => x.id === filter);
  const shown = apps.filter(f.match);

  return (
    <section aria-labelledby="applicants-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="applicants-title" className="poster-title text-3xl text-gold">
            Auditions · {apps.length}
          </h2>
          <p className="mt-1 font-mono text-xs text-muted">{openingsLabel(job)}</p>
        </div>
      </div>

      {job.contracts?.length > 0 && (
        <div className="mt-4 border border-gold/30 bg-surface p-4">
          <p className="stat-label">Contracts from this posting</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {job.contracts.map((c) => (
              <li key={c.id}>
                <Link to={`/jobs/${c.id}`} className="flex items-center justify-between gap-3 bg-black/30 px-3 py-2 text-sm hover:bg-black/50">
                  <span className="font-semibold">{c.freelancer.name}</span>
                  <Badge tone={(jobStatus[c.status] || jobStatus.open).tone}>{(jobStatus[c.status] || jobStatus.open).label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Filter applications" className="mt-5 flex flex-wrap gap-2">
        {filters.map((x) => {
          const n = apps.filter(x.match).length;
          return (
            <button
              key={x.id}
              role="tab"
              aria-selected={filter === x.id}
              onClick={() => setFilter(x.id)}
              className={`eyebrow min-h-10 px-4 transition-colors ${filter === x.id ? "bg-gold text-poster" : "border border-[#3a3733] hover:border-gold hover:text-gold"}`}
            >
              {x.label} ({n})
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted">
          {apps.length === 0 ? "No applications yet. They will appear here as freelancers apply." : "Nobody in this list."}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {shown.map((a) => (
            <Applicant key={a.id} a={a} job={job} user={user} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}
