import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadProtectedFile } from "../../lib/api";
import { splitSkills, toUsdc, usdc } from "../../lib/format";
import { useSiteConfig } from "../../lib/siteConfig";
import { Button, ErrorNote, Field, Icon } from "../ui";

const DURATIONS = ["Less than a week", "1 to 4 weeks", "1 to 3 months", "More than 3 months"];
const LEVELS = ["Entry", "Intermediate", "Expert"];
const MAX_BYTES = 10 * 1024 * 1024;

// One form for posting, saving a draft, and editing: `job` is set when editing an existing posting.
export default function JobForm({ job }) {
  const navigate = useNavigate();
  const site = useSiteConfig();
  const editing = !!job;
  const isDraft = job?.status === "draft";
  const locked = editing && job.applicants > 0; // applicants applied against these milestones

  const [form, setForm] = useState({
    title: job?.title || "",
    description: job?.description || "",
    skills: job?.skills?.join(", ") || "",
    category: job?.category || "",
    openings: String(job?.openings || 1),
    openDays: "14",
    extendDays: "",
    duration: job?.duration || "",
    level: job?.level || "",
  });
  const [milestones, setMilestones] = useState(job ? job.milestones.map((m) => ({ title: m.title, amount: String(toUsdc(m.amount)) })) : [{ title: "", amount: "" }]);
  const [files, setFiles] = useState([]);
  const [existing, setExisting] = useState(job?.attachments || []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const setMs = (i, key, value) => setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, [key]: value } : m)));
  const total = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  function pickFiles(e) {
    const chosen = [...e.target.files];
    e.target.value = "";
    const next = [...files, ...chosen];
    if (next.length + existing.length > 5) return setError("A job can have up to 5 files.");
    const big = next.find((f) => f.size > MAX_BYTES);
    if (big) return setError(`${big.name} is over 10 MB.`);
    setError("");
    setFiles(next);
  }

  async function removeExisting(f) {
    try {
      await api(`/api/files/${f.id}`, { method: "DELETE" });
      setExisting((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      setError(err.message);
    }
  }

  // intent: "publish" | "draft" | "save"
  async function submit(e, intent) {
    e.preventDefault();
    setError("");
    setSaving(intent);
    const body = {
      title: form.title,
      description: form.description,
      skills: splitSkills(form.skills),
      category: form.category,
      openings: Number(form.openings),
      openDays: Number(form.openDays),
      duration: form.duration,
      level: form.level,
      milestones: milestones.map((m) => ({ title: m.title, amount: Number(m.amount) })),
    };
    try {
      let saved;
      if (editing) {
        saved = await api(`/api/jobs/${job.id}`, { method: "PUT", body: { ...body, extendDays: Number(form.extendDays) || 0 } });
        if (intent === "publish" && isDraft) saved = await api(`/api/jobs/${job.id}/publish`, { method: "POST" });
      } else {
        saved = await api("/api/jobs", { method: "POST", body: { ...body, draft: intent === "draft" } });
      }
      // Files go up after the job exists, one by one, so a problem with one file does not lose the rest.
      const failed = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        try {
          await api(`/api/jobs/${saved.id}/attachments`, { method: "POST", body: fd });
        } catch (err) {
          failed.push(`${f.name}: ${err.message}`);
        }
      }
      if (failed.length) {
        setError(`The job was saved, but some files were not attached. ${failed.join(" ")}`);
        setSaving("");
        setFiles([]);
        setTimeout(() => navigate(`/jobs/${saved.id}`), 2500);
        return;
      }
      navigate(`/jobs/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setSaving("");
    }
  }

  return (
    <form onSubmit={(e) => submit(e, editing ? "save" : "publish")} className="space-y-8">
      <section className="card space-y-5 p-6 sm:p-8">
        <Field label="Job title" htmlFor="job-title">
          <input id="job-title" name="title" required minLength={5} maxLength={120} value={form.title} onChange={set} placeholder="e.g. Build a token vesting dashboard" className="input" />
        </Field>
        <Field label="Description" htmlFor="job-desc" hint={`What should be delivered, and what does done look like? ${form.description.length}/5000`}>
          <textarea id="job-desc" name="description" required minLength={20} maxLength={5000} rows={7} value={form.description} onChange={set} className="input" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="job-category">
            <select id="job-category" name="category" value={form.category} onChange={set} className="input">
              <option value="">Choose a category</option>
              {site.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Skills needed" htmlFor="job-skills" hint="Comma separated, e.g. Solidity, React">
            <input id="job-skills" name="skills" value={form.skills} onChange={set} className="input" />
          </Field>
          <Field label="Openings" htmlFor="job-openings" hint={Number(form.openings) > 1 ? "Each hire gets their own contract with these milestones." : "How many people you want to hire."}>
            <input id="job-openings" name="openings" type="number" min={Math.max(1, job?.hired || 1)} max="20" required value={form.openings} onChange={set} className="input" />
          </Field>
          {editing && !isDraft ? (
            <Field label="Applications" htmlFor="job-extend" hint={job.closesAt ? `Currently open until ${new Date(job.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : undefined}>
              <select id="job-extend" name="extendDays" value={form.extendDays} onChange={set} className="input">
                <option value="">Keep the current deadline</option>
                {[3, 7, 14, 21, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    Keep open {d} more days from today
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Applications close in" htmlFor="job-open-days" hint={isDraft || !editing ? "Counted from the day you publish." : undefined}>
              <select id="job-open-days" name="openDays" value={form.openDays} onChange={set} className="input">
                {[3, 7, 14, 21, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Expected duration" htmlFor="job-duration">
            <select id="job-duration" name="duration" value={form.duration} onChange={set} className="input">
              <option value="">Not sure yet</option>
              {DURATIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Experience level" htmlFor="job-level">
            <select id="job-level" name="level" value={form.level} onChange={set} className="input">
              <option value="">Any</option>
              {LEVELS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <p className="text-sm text-muted">
            Budget: <strong className="text-ink">{usdc(total * 1_000_000)}</strong> USDC
          </p>
        </div>
        {locked && <p className="mt-3 border border-amber-800/50 bg-amber-50 px-3 py-2 text-sm text-amber-900">People have already applied against these milestones, so they cannot change. To change them, close this posting and repost it.</p>}
        <ul className="mt-4 space-y-3">
          {milestones.map((m, i) => (
            <li key={i} className="grid grid-cols-[1fr_7rem_2.75rem] items-end gap-3 sm:grid-cols-[1fr_9rem_2.75rem]">
              <Field label={`Milestone ${i + 1}`} htmlFor={`ms-title-${i}`}>
                <input id={`ms-title-${i}`} required maxLength={100} disabled={locked} value={m.title} onChange={(e) => setMs(i, "title", e.target.value)} placeholder="Deliverable" className="input disabled:opacity-60" />
              </Field>
              <Field label="USDC" htmlFor={`ms-amt-${i}`}>
                <input id={`ms-amt-${i}`} type="number" required min="1" max="1000000" step="0.01" inputMode="decimal" disabled={locked} value={m.amount} onChange={(e) => setMs(i, "amount", e.target.value)} className="input disabled:opacity-60" />
              </Field>
              <button
                type="button"
                aria-label={`Remove milestone ${i + 1}`}
                disabled={locked || milestones.length === 1}
                onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                className="flex h-11 w-11 items-center justify-center text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
              >
                <Icon name="x" size={18} />
              </button>
            </li>
          ))}
        </ul>
        {!locked && milestones.length < 10 && (
          <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => setMilestones((ms) => [...ms, { title: "", amount: "" }])}>
            <Icon name="plus" size={16} /> Add milestone
          </Button>
        )}
        <p className="mt-5 rounded-lg border border-dashed border-[#3d3332] px-4 py-3 tabular-nums text-sm text-muted">
          A 2% platform fee is deducted from the freelancer&apos;s payout when a milestone is released. You pay the milestone price, nothing extra.
          {Number(form.openings) > 1 && ` With ${form.openings} openings, your total if everyone completes is ${usdc(total * Number(form.openings) * 1_000_000)}.`}
        </p>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Files for applicants</h2>
        <p className="mt-1 text-sm text-muted">Specs, designs or a brief. Signed-in people can open them. Up to 5 files, 10 MB each (images, PDF, ZIP, text).</p>
        <ul className="mt-3 space-y-2">
          {existing.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <Icon name="file" size={14} className="text-gold" />
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-gold" onClick={() => downloadProtectedFile(f.url, f.name).catch((e) => setError(e.message))}>
                {f.name}
              </button>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeExisting(f)} className="text-muted hover:text-red-700">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
              <Icon name="paperclip" size={14} />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted">to be uploaded</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted hover:text-red-700">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#3d3332] px-4 text-sm hover:border-[#6a5a55] hover:text-ink">
          <Icon name="paperclip" size={14} /> Add files
          <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/zip,text/plain,.txt,.md,.csv,.json" onChange={pickFiles} className="sr-only" />
        </label>
      </section>

      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving === "publish" || saving === "save"} disabled={!!saving}>
          {editing ? (isDraft ? "Save and publish" : "Save changes") : "Publish job"}
        </Button>
        {(!editing || isDraft) && (
          <Button type="button" variant="secondary" loading={saving === "draft"} disabled={!!saving} onClick={(e) => (editing ? submit(e, "save") : submit(e, "draft"))}>
            Save as draft
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => navigate(editing ? `/jobs/${job.id}` : "/jobs")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
