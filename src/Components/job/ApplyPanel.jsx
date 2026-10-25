import { useState } from "react";
import { Link } from "react-router-dom";
import { api, openProtectedFile } from "../../lib/api";
import { isClosed, toUsdc, usdc } from "../../lib/format";
import { Badge, Button, ErrorNote, Field, Icon } from "../ui";
import { appStatus } from "../../lib/jobStatus";
import JobFacts from "./JobFacts";
import Thread from "./Thread";

const MAX_RESUME = 5 * 1024 * 1024;


// Links and resume an application carries, shown the same way to both sides.
export function ProofOfWork({ app }) {
  const [error, setError] = useState("");
  if (!app.githubUrl && !app.portfolioUrl && !app.resume) return null;
  const link = "inline-flex min-h-9 items-center gap-1.5 border border-[#3a3733] px-3 text-xs hover:border-gold hover:text-gold";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {app.githubUrl && (
          <a href={app.githubUrl} target="_blank" rel="noopener noreferrer" className={link}>
            <Icon name="github" size={14} /> GitHub
          </a>
        )}
        {app.portfolioUrl && (
          <a href={app.portfolioUrl} target="_blank" rel="noopener noreferrer" className={link}>
            <Icon name="globe" size={14} /> Portfolio
          </a>
        )}
        {app.resume && (
          <button type="button" className={link} onClick={() => openProtectedFile(app.resume).catch((e) => setError(e.message))}>
            <Icon name="file" size={14} /> {app.resumeName || "Resume"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function Quote({ app, budget }) {
  if (app.bid == null && app.etaDays == null) return null;
  const diff = app.bid != null ? app.bid - budget : 0;
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.8rem]">
      {app.bid != null && (
        <div className="flex gap-1.5">
          <dt className="text-muted">Quote</dt>
          <dd className="font-bold">
            {usdc(app.bid)}
            {diff !== 0 && <span className={diff > 0 ? "text-red-700" : "text-gold"}> ({diff > 0 ? "+" : "−"}{usdc(Math.abs(diff))} vs budget)</span>}
          </dd>
        </div>
      )}
      {app.etaDays != null && (
        <div className="flex gap-1.5">
          <dt className="text-muted">Delivery</dt>
          <dd className="font-bold">{app.etaDays} days</dd>
        </div>
      )}
    </dl>
  );
}

function MyApplication({ job, user, onChange }) {
  const app = job.myApplication;
  const st = appStatus[app.status] || appStatus.pending;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canWithdraw = app.status === "pending" || app.status === "shortlisted";

  async function withdraw() {
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/applications/${app.id}`, { method: "DELETE" }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="poster-title text-2xl">Your application</h2>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        {app.status === "accepted" && app.contractId && (
          <Button to={`/jobs/${app.contractId}`} className="mt-4 w-full">
            Open your contract <Icon name="arrow" size={14} />
          </Button>
        )}
        {app.status === "declined" && <p className="mt-2 text-sm text-muted">The client went with someone else this time.</p>}
        <Quote app={app} budget={job.total} />
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{app.cover}</p>
        <ProofOfWork app={app} />
        {canWithdraw && (
          <div className="mt-4 border-t border-dashed border-white/10 pt-4">
            {confirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Withdraw this application?</span>
                <Button size="sm" variant="danger" loading={busy} onClick={withdraw}>
                  Yes, withdraw
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
                Withdraw application
              </Button>
            )}
          </div>
        )}
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </section>
      {app.status !== "declined" && (
        <Thread path={`/api/applications/${app.id}/messages`} user={user} title="Talk to the client" empty="Questions about the brief? Ask the client here." />
      )}
    </div>
  );
}

export default function ApplyPanel({ job, user, openLogin, onChange }) {
  const [form, setForm] = useState({ cover: "", bid: String(toUsdc(job.total)), etaDays: "", githubUrl: "", portfolioUrl: "" });
  const [resume, setResume] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErr, setFieldErr] = useState({});

  if (job.myApplication) return <MyApplication job={job} user={user} onChange={onChange} />;

  const closed = isClosed(job);
  const header = (
    <>
      <h2 className="poster-title text-2xl">{closed ? "Applications closed" : "Apply to this job"}</h2>
      <JobFacts job={job} className="mt-3" />
    </>
  );
  if (closed)
    return (
      <section className="card p-5">
        {header}
        <p className="mt-3 text-sm text-muted">{job.status === "open" ? "The deadline for this posting has passed." : "This posting is no longer hiring."}</p>
      </section>
    );
  if (!user)
    return (
      <section className="card p-5">
        {header}
        <p className="mt-4 text-sm text-muted">Log in to apply with a cover note, your quote, and a resume or links to your work.</p>
        <Button className="mt-4 w-full" onClick={openLogin}>
          Log in to apply
        </Button>
      </section>
    );

  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  function pickResume(e) {
    const f = e.target.files?.[0] || null;
    setFieldErr((x) => ({ ...x, resume: "" }));
    if (f && f.type !== "application/pdf") {
      setFieldErr((x) => ({ ...x, resume: "Upload a PDF" }));
      e.target.value = "";
      return;
    }
    if (f && f.size > MAX_RESUME) {
      setFieldErr((x) => ({ ...x, resume: "Keep it under 5 MB" }));
      e.target.value = "";
      return;
    }
    setResume(f);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!resume && !form.githubUrl.trim() && !form.portfolioUrl.trim()) {
      setError("Attach a resume or add a GitHub or portfolio link so the client can see your work.");
      return;
    }
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v.trim()));
    if (resume) body.append("resume", resume);
    setBusy(true);
    try {
      onChange(await api(`/api/jobs/${job.id}/apply`, { method: "POST", body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      {header}
      <Field label="Cover note" htmlFor="cover" hint={`Why you are a fit, and how you would approach it. ${form.cover.trim().length}/2000, at least 20.`}>
        <textarea id="cover" name="cover" required minLength={20} maxLength={2000} rows={5} value={form.cover} onChange={set} className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your quote (USDC)" htmlFor="bid" hint={`Budget: ${usdc(job.total)}`}>
          <input id="bid" name="bid" type="number" min="1" max="1000000" step="0.01" inputMode="decimal" value={form.bid} onChange={set} className="input" />
        </Field>
        <Field label="Delivery (days)" htmlFor="etaDays" hint="Your estimate">
          <input id="etaDays" name="etaDays" type="number" min="1" max="365" inputMode="numeric" value={form.etaDays} onChange={set} className="input" />
        </Field>
      </div>
      <p className="text-xs text-muted">Show your work: a resume, a GitHub profile or a portfolio. At least one.</p>
      <Field label="GitHub" htmlFor="githubUrl">
        <input id="githubUrl" name="githubUrl" type="url" placeholder="https://github.com/you" pattern="https?://(www\.)?github\.com/.+" value={form.githubUrl} onChange={set} className="input" />
      </Field>
      <Field label="Portfolio or past work" htmlFor="portfolioUrl">
        <input id="portfolioUrl" name="portfolioUrl" type="url" placeholder="https://your-site.dev" value={form.portfolioUrl} onChange={set} className="input" />
      </Field>
      <Field label="Resume (PDF, up to 5 MB)" htmlFor="resume" error={fieldErr.resume} hint={resume ? `${resume.name} · ${(resume.size / 1024).toFixed(0)} KB` : "Only the client can open it."}>
        <input id="resume" type="file" accept="application/pdf" onChange={pickResume} className="input file:mr-3 file:border-0 file:bg-gold file:px-3 file:py-1 file:font-semibold file:text-poster" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" loading={busy} className="w-full">
        Send application
      </Button>
      <Link to="/developers" className="block text-center text-xs text-muted hover:text-gold">
        No developer profile yet? Clients see your rate and rating when you have one.
      </Link>
    </form>
  );
}
