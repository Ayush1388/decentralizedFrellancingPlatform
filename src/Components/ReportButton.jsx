import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { Button, ErrorNote, Field, Icon } from "./ui";

// "Report" for a job or a person: opens a small form, sends the reason to the platform team.
export default function ReportButton({ kind, targetId, label = "Report", className = "" }) {
  const { user, openLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/reports", { method: "POST", body: { kind, targetId, reason } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className={`text-xs text-muted ${className}`}>Thanks. The platform team will take a look.</p>;
  if (!open)
    return (
      <button type="button" onClick={() => (user ? setOpen(true) : openLogin())} className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-red-700 ${className}`}>
        <Icon name="flag" size={12} /> {label}
      </button>
    );
  return (
    <form onSubmit={send} className={`card space-y-3 p-4 ${className}`}>
      <Field label={`What is wrong with this ${kind}?`} htmlFor={`report-${kind}-${targetId}`} hint="10 to 1000 characters. Be specific.">
        <textarea id={`report-${kind}-${targetId}`} required minLength={10} maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" loading={busy}>
          Send report
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
