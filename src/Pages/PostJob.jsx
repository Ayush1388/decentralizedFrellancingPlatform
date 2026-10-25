import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { splitSkills, usdc } from "../lib/format";
import { Button, EmptyState, ErrorNote, Field, Icon, PageHeader } from "../Components/ui";

export default function PostJob() {
  const { user, ready, openLogin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", skills: "", openings: "1", openDays: "14", duration: "", level: "" });
  const [milestones, setMilestones] = useState([{ title: "", amount: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const setMs = (i, key, value) => setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, [key]: value } : m)));
  const total = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  if (ready && !user) {
    return (
      <div className="container-page pt-16">
        <EmptyState icon="lock" title="Log in to post a job" action={<Button onClick={openLogin}>Log in</Button>}>
          You need an account so freelancers know who they are working with.
        </EmptyState>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const job = await api("/api/jobs", {
        method: "POST",
        body: {
          ...form,
          skills: splitSkills(form.skills),
          openings: Number(form.openings),
          openDays: Number(form.openDays),
          milestones: milestones.map((m) => ({ title: m.title, amount: Number(m.amount) })),
        },
      });
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="container-page max-w-3xl pb-8">
      <PageHeader eyebrow="Casting call" image="/Work time-cuate.svg" title="Pitch a picture" subtitle="Describe the work and break it into milestones. You fund each milestone only after you hire someone." />

      <form onSubmit={submit} className="space-y-8">
        <section className="card space-y-5 p-6 sm:p-8">
          <Field label="Job title" htmlFor="job-title">
            <input id="job-title" name="title" required minLength={5} maxLength={120} value={form.title} onChange={set} placeholder="e.g. Build a token vesting dashboard" className="input" />
          </Field>
          <Field label="Description" htmlFor="job-desc" hint="What should be delivered, and what does done look like?">
            <textarea id="job-desc" name="description" required minLength={20} maxLength={5000} rows={6} value={form.description} onChange={set} className="input" />
          </Field>
          <Field label="Skills needed" htmlFor="job-skills" hint="Comma separated, e.g. Solidity, React">
            <input id="job-skills" name="skills" value={form.skills} onChange={set} className="input" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Openings" htmlFor="job-openings" hint={Number(form.openings) > 1 ? "Each hire gets their own contract with these milestones." : "How many people you want to hire."}>
              <input id="job-openings" name="openings" type="number" min="1" max="20" required value={form.openings} onChange={set} className="input" />
            </Field>
            <Field label="Applications close in" htmlFor="job-open-days">
              <select id="job-open-days" name="openDays" value={form.openDays} onChange={set} className="input">
                {[3, 7, 14, 21, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected duration" htmlFor="job-duration">
              <select id="job-duration" name="duration" value={form.duration} onChange={set} className="input">
                <option value="">Not sure yet</option>
                {["Less than a week", "1 to 4 weeks", "1 to 3 months", "More than 3 months"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Experience level" htmlFor="job-level">
              <select id="job-level" name="level" value={form.level} onChange={set} className="input">
                <option value="">Any</option>
                {["Entry", "Intermediate", "Expert"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="card p-6 sm:p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="poster-title text-2xl">Milestones</h2>
            <p className="text-sm text-muted">
              Budget: <strong className="text-ink">{usdc(total * 1_000_000)}</strong> USDC
            </p>
          </div>
          <ul className="mt-4 space-y-3">
            {milestones.map((m, i) => (
              <li key={i} className="grid grid-cols-[1fr_7rem_2.75rem] items-end gap-3 sm:grid-cols-[1fr_9rem_2.75rem]">
                <Field label={`Milestone ${i + 1}`} htmlFor={`ms-title-${i}`}>
                  <input id={`ms-title-${i}`} required maxLength={100} value={m.title} onChange={(e) => setMs(i, "title", e.target.value)} placeholder="Deliverable" className="input" />
                </Field>
                <Field label="USDC" htmlFor={`ms-amt-${i}`}>
                  <input id={`ms-amt-${i}`} type="number" required min="1" max="1000000" step="0.01" inputMode="decimal" value={m.amount} onChange={(e) => setMs(i, "amount", e.target.value)} className="input" />
                </Field>
                <button
                  type="button"
                  aria-label={`Remove milestone ${i + 1}`}
                  disabled={milestones.length === 1}
                  onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 items-center justify-center text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                >
                  <Icon name="x" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {milestones.length < 10 && (
            <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => setMilestones((ms) => [...ms, { title: "", amount: "" }])}>
              <Icon name="plus" size={16} /> Add milestone
            </Button>
          )}
          <p className="mt-5 border border-dashed border-white/10 px-4 py-3 font-mono text-sm text-muted">
            A 2% platform fee is deducted from the freelancer's payout when a milestone is released. You pay the milestone price, nothing extra.
            {Number(form.openings) > 1 && ` With ${form.openings} openings, your total if everyone completes is ${usdc(total * Number(form.openings) * 1_000_000)}.`}
          </p>
        </section>

        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Publish job
        </Button>
      </form>
    </div>
  );
}
