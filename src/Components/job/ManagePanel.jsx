import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { toUsdc, usdc } from "../../lib/format";
import { Button, ErrorNote, Field, Icon } from "../ui";

// Rows of "title + amount", used to renegotiate milestones and to describe follow-up work.
function MilestoneRows({ rows, setRows, disabled }) {
  const total = rows.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const set = (i, k, v) => setRows(rows.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((m, i) => (
          <li key={i} className="grid grid-cols-[1fr_6.5rem_2.5rem] items-end gap-2">
            <Field label={`Milestone ${i + 1}`} htmlFor={`mr-t-${i}`}>
              <input id={`mr-t-${i}`} required maxLength={100} disabled={disabled} value={m.title} onChange={(e) => set(i, "title", e.target.value)} className="input" />
            </Field>
            <Field label="USDC" htmlFor={`mr-a-${i}`}>
              <input id={`mr-a-${i}`} type="number" required min="1" max="1000000" step="0.01" disabled={disabled} value={m.amount} onChange={(e) => set(i, "amount", e.target.value)} className="input" />
            </Field>
            <button type="button" aria-label={`Remove milestone ${i + 1}`} disabled={disabled || rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="flex h-11 w-10 items-center justify-center text-muted hover:text-red-700 disabled:opacity-30">
              <Icon name="x" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rows.length < 10 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRows([...rows, { title: "", amount: "" }])}>
            <Icon name="plus" size={14} /> Add milestone
          </Button>
        )}
        <p className="ml-auto font-mono text-sm text-muted">
          Total <strong className="text-ink">{usdc(total * 1_000_000)}</strong>
        </p>
      </div>
    </div>
  );
}

function RenegotiateForm({ job, onChange, onClose }) {
  const [rows, setRows] = useState(job.milestones.map((m) => ({ title: m.title, amount: String(toUsdc(m.amount)) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/jobs/${job.id}/milestones`, { method: "PUT", body: { milestones: rows.map((m) => ({ title: m.title, amount: Number(m.amount) })) } }));
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h3 className="poster-title text-2xl">Change the milestones</h3>
      <p className="text-sm text-muted">Agree the new plan in the chat first. This is possible until the first milestone is funded; the freelancer is told when you save.</p>
      <MilestoneRows rows={rows} setRows={setRows} />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Save milestones
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FollowUpForm({ job, onClose }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState([{ title: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api(`/api/jobs/${job.id}/followup`, {
        method: "POST",
        body: { title, milestones: rows.map((m) => ({ title: m.title, amount: Number(m.amount) })) },
      });
      navigate(`/jobs/${created.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h3 className="poster-title text-2xl">Add follow-up work</h3>
      <p className="text-sm text-muted">More scope, an extra milestone or a bonus for great work becomes its own contract with {job.freelancer?.name.split(" ")[0] || "the freelancer"}, with its own escrow, so the original is untouched.</p>
      <Field label="What is it for?" htmlFor="fu-title">
        <input id="fu-title" required minLength={5} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add dark mode, or Bonus for early delivery" className="input" />
      </Field>
      <MilestoneRows rows={rows} setRows={setRows} />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Create the contract
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// What a client can do to their own job, depending on where it stands.
export default function ManagePanel({ job, onChange }) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState(""); // "milestones" | "followup" | ""
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (job.viewerRole !== "client") return null;

  const untouched = job.milestones.every((m) => m.status === "pending");
  const canRenegotiate = job.status === "in_progress" && job.freelancer && untouched && job.escrowId == null;
  const hired = !!job.freelancer;

  async function call(key, path, method = "POST", after) {
    setBusy(key);
    setError("");
    try {
      const out = await api(path, { method });
      setConfirm("");
      after ? after(out) : onChange(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const btn = (key, label, icon, run, variant = "outline") => (
    <Button key={key} size="sm" variant={variant} loading={busy === key} onClick={run}>
      <Icon name={icon} size={14} /> {label}
    </Button>
  );

  const cancelCopy = job.status === "in_progress" ? "End this contract? Nothing has been funded, so no money moves." : job.status === "draft" ? "Discard this draft?" : "Close this posting? Pending applicants are declined.";
  const cancelLabel = job.status === "in_progress" ? "End contract" : job.status === "draft" ? "Discard draft" : "Close posting";

  const actions = [];
  if (job.status === "draft") {
    actions.push(btn("publish", "Publish", "check", () => call("publish", `/api/jobs/${job.id}/publish`), "primary"));
    actions.push(btn("edit", "Edit draft", "edit", () => navigate(`/jobs/${job.id}/edit`)));
  }
  if (job.status === "open" || job.status === "filled") {
    actions.push(btn("edit", "Edit posting", "edit", () => navigate(`/jobs/${job.id}/edit`)));
  }
  if (canRenegotiate) actions.push(btn("ms", "Change milestones", "edit", () => setPanel(panel === "milestones" ? "" : "milestones")));
  if (hired && (job.status === "in_progress" || job.status === "completed")) actions.push(btn("fu", "Add follow-up work", "plus", () => setPanel(panel === "followup" ? "" : "followup")));
  if (["open", "filled", "cancelled", "completed"].includes(job.status) && !job.parentId) actions.push(btn("repost", "Repost a copy", "copy", () => call("repost", `/api/jobs/${job.id}/repost`, "POST", (d) => navigate(`/jobs/${d.id}/edit`))));
  const canCancel = job.status === "draft" || job.status === "open" || job.status === "filled" || (job.status === "in_progress" && untouched);

  if (!actions.length && !canCancel) return null;
  return (
    <section className="space-y-3" aria-label="Manage this job">
      <p className="stat-label">Manage</p>
      <div className="flex flex-wrap gap-2">
        {actions}
        {canCancel &&
          (confirm === "cancel" ? (
            <span className="flex w-full flex-col gap-2 border border-red-700/40 p-3 text-sm">
              {cancelCopy}
              <span className="flex gap-2">
                <Button size="sm" variant="danger" loading={busy === "cancel"} onClick={() => call("cancel", `/api/jobs/${job.id}/cancel`)}>
                  Yes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm("")}>
                  Keep it
                </Button>
              </span>
            </span>
          ) : (
            btn("cancel-ask", cancelLabel, "x", () => setConfirm("cancel"), "ghost")
          ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {panel === "milestones" && <RenegotiateForm job={job} onChange={onChange} onClose={() => setPanel("")} />}
      {panel === "followup" && <FollowUpForm job={job} onClose={() => setPanel("")} />}
    </section>
  );
}
