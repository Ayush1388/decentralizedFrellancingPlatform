import { useState } from "react";
import { shortDate, usdc } from "../../lib/format";
import { friendlyError } from "../../lib/useEscrow";
import { Badge, Button, ErrorNote, Field, Icon } from "../ui";

const msStatus = {
  pending: { label: "Not funded", tone: "gray" },
  funded: { label: "In escrow", tone: "blue" },
  submitted: { label: "In review", tone: "amber" },
  released: { label: "Paid", tone: "green" },
  refunded: { label: "Refunded", tone: "gray" },
  disputed: { label: "Disputed", tone: "red" },
  resolved: { label: "Resolved", tone: "violet" },
};

const isPast = (iso) => iso && new Date(iso).getTime() <= Date.now();

// One open text box at a time: request changes, or explain a dispute.
function NoteForm({ id, label, hint, cta, variant, busy, onSubmit, onCancel, min = 10 }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-4 space-y-3 border border-white/10 bg-black/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(text);
      }}
    >
      <Field label={label} htmlFor={id} hint={hint}>
        <textarea id={id} required minLength={min} maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} className="input" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant={variant} loading={busy}>
          {cta}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function MilestoneCard({ m, job, user, onChange, perform, step, chainOn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [pct, setPct] = useState(50);
  const [panel, setPanel] = useState(""); // "revise" | "dispute" | ""
  const st = msStatus[m.status];
  const role = job.viewerRole;
  const fee = (m.amount * job.feeBps) / 10000;

  async function act(action, body) {
    setBusy(true);
    setError("");
    try {
      onChange(await perform(m, action, body));
      setPanel("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const canDispute = (role === "client" || role === "freelancer") && (m.status === "funded" || m.status === "submitted");

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-gold">
            Scene {m.position}
            {m.revisions > 0 && ` · ${m.revisions} change request${m.revisions > 1 ? "s" : ""}`}
          </p>
          <h3 className="poster-title text-2xl">{m.title}</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold">{usdc(m.amount)}</p>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>

      {role === "freelancer" && !["refunded", "resolved"].includes(m.status) && (
        <p className="mt-2 font-mono text-xs text-muted">
          {m.status === "released" ? "You received" : "You will receive"} {usdc(m.amount - fee)} after the {job.feeBps / 100}% fee.
        </p>
      )}

      {/* The client's change request, shown while the freelancer is reworking it */}
      {m.status === "funded" && m.feedback && (
        <div className="mt-3 border-l-2 border-amber-800 bg-butter/60 px-4 py-3 text-sm">
          <p className="stat-label !text-amber-800">Changes requested</p>
          <p className="mt-1 whitespace-pre-wrap">{m.feedback}</p>
        </div>
      )}

      {m.deliverableUrl && (
        <div className={`mt-3 space-y-1 text-sm ${m.status === "funded" ? "opacity-60" : ""}`}>
          {m.status === "funded" && <p className="stat-label">Previous delivery</p>}
          <p className="flex items-center gap-2">
            <Icon name="link" size={16} className="text-gold" />
            <a href={m.deliverableUrl} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-gold underline-offset-2 hover:underline">
              {m.deliverableUrl}
            </a>
          </p>
          {m.submissionNote && <p className="whitespace-pre-wrap pl-6 text-ink-soft">{m.submissionNote}</p>}
        </div>
      )}

      {m.status === "disputed" && m.disputeReason && (
        <div className="mt-3 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm">
          <p className="stat-label !text-red-700">Dispute</p>
          <p className="mt-1 whitespace-pre-wrap">{m.disputeReason}</p>
          <p className="mt-2 text-xs text-muted">Funds are frozen until the platform arbiter rules.</p>
        </div>
      )}

      {m.status === "submitted" && m.claimableAt && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Icon name="clock" size={16} />
          {isPast(m.claimableAt) ? "Review window ended. The freelancer can claim this payment." : `Client has until ${shortDate(m.claimableAt)} to review, then the freelancer can claim.`}
        </p>
      )}
      {m.status === "funded" && m.refundableAt && role === "client" && !isPast(m.refundableAt) && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Icon name="clock" size={16} /> You can reclaim these funds after {shortDate(m.refundableAt)} if nothing is delivered.
        </p>
      )}
      {m.status === "pending" && role === "client" && job.freelancer && (
        <p className="mt-2 text-sm text-muted">Fund this milestone when you want work on it to start.</p>
      )}
      {m.status === "pending" && role === "freelancer" && <p className="mt-2 text-sm text-muted">Waiting for the client to fund this milestone. Start once it is in escrow.</p>}
      {m.status === "resolved" && m.freelancerBps != null && <p className="mt-2 text-sm text-muted">The arbiter awarded {m.freelancerBps / 100}% to the freelancer.</p>}

      {/* Freelancer: deliver */}
      {role === "freelancer" && m.status === "funded" && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            act("submit", { deliverableUrl: url, note });
          }}
        >
          <Field label={m.feedback ? "Link to the revised work" : "Link to your deliverable"} htmlFor={`del-${m.id}`}>
            <input id={`del-${m.id}`} required type="url" placeholder="https://github.com/… or ipfs://…" value={url} onChange={(e) => setUrl(e.target.value)} className="input" />
          </Field>
          <Field label="What did you deliver?" htmlFor={`note-${m.id}`} hint="Optional: what changed, how to test it, anything to look at first.">
            <textarea id={`note-${m.id}`} maxLength={1000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input" />
          </Field>
          <Button type="submit" loading={busy}>
            {m.feedback ? "Resubmit work" : "Submit work"}
          </Button>
        </form>
      )}

      {!panel && (
        <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
          {role === "client" && m.status === "pending" && job.freelancer && (
            <Button size="sm" loading={busy} disabled={chainOn && job.escrowId == null} onClick={() => act("fund")}>
              <Icon name="lock" size={16} /> Fund {usdc(m.amount)}
            </Button>
          )}
          {role === "client" && m.status === "submitted" && (
            <>
              <Button size="sm" loading={busy} onClick={() => act("approve")}>
                <Icon name="check" size={16} /> Approve &amp; release
              </Button>
              {!chainOn && (
                <Button size="sm" variant="secondary" onClick={() => setPanel("revise")}>
                  Request changes
                </Button>
              )}
            </>
          )}
          {role === "client" && m.status === "funded" && isPast(m.refundableAt) && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => act("refund")}>
              Reclaim funds
            </Button>
          )}
          {role === "freelancer" && m.status === "submitted" && isPast(m.claimableAt) && (
            <Button size="sm" loading={busy} onClick={() => act("claim")}>
              Claim payment
            </Button>
          )}
          {canDispute && (
            <Button size="sm" variant="ghost" className="!text-red-700" onClick={() => setPanel("dispute")}>
              Open dispute
            </Button>
          )}
        </div>
      )}

      {panel === "revise" && (
        <NoteForm
          id={`revise-${m.id}`}
          label="What needs to change?"
          hint="Be specific. The milestone goes back to the freelancer with this note; the money stays in escrow."
          cta="Send change request"
          busy={busy}
          onSubmit={(feedback) => act("revise", { feedback })}
          onCancel={() => setPanel("")}
        />
      )}
      {panel === "dispute" && (
        <NoteForm
          id={`dispute-${m.id}`}
          label="Why are you disputing this milestone?"
          hint="The funds freeze and a neutral arbiter reads this, the chat and the activity log before splitting them."
          cta="Open dispute"
          variant="danger"
          busy={busy}
          onSubmit={(reason) => act("dispute", { reason })}
          onCancel={() => setPanel("")}
        />
      )}

      {/* Arbiter */}
      {user?.isAdmin && m.status === "disputed" && (
        <form
          className="mt-4 bg-red-50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            act("resolve", { freelancerPercent: Number(pct) });
          }}
        >
          <label htmlFor={`pct-${m.id}`} className="text-sm font-medium">
            Arbiter ruling: {pct}% to freelancer, {100 - pct}% back to client
          </label>
          <input id={`pct-${m.id}`} type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-2 w-full accent-[#f2c230]" />
          <Button type="submit" size="sm" className="mt-2" loading={busy}>
            Issue ruling
          </Button>
        </form>
      )}

      {busy && step && <p className="mt-3 text-sm text-gold">{step}</p>}
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </li>
  );
}
