import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo, usdc } from "../lib/format";
import { Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, SkillChip } from "../Components/ui";
import { Poster } from "../Components/cinema";
import { reelDate } from "../lib/cinema";
import { jobStatus } from "../lib/jobStatus";
import { useChainConfig } from "../context/useChainConfig";
import { friendlyError, useEscrow } from "../lib/useEscrow";
import MilestoneCard from "../Components/job/MilestoneCard";
import ApplyPanel from "../Components/job/ApplyPanel";
import ApplicantsPanel from "../Components/job/ApplicantsPanel";
import Activity from "../Components/job/Activity";
import ReviewPanel from "../Components/job/ReviewPanel";
import JobFacts from "../Components/job/JobFacts";
import Thread from "../Components/job/Thread";

function OpenEscrow({ job, eth, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = !job.clientWallet ? "Link your wallet on the Wallet page first." : !job.freelancerWallet ? `${job.freelancer.name} has not linked a wallet yet.` : "";

  async function open() {
    setBusy(true);
    setError("");
    try {
      const txHash = await eth.onchain("create", { freelancer: job.freelancerWallet, amounts: job.milestones.map((m) => m.amount) });
      onChange(await api(`/api/jobs/${job.id}/escrow`, { method: "POST", body: { txHash } }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 !border-gold/50 p-5">
      <h3 className="poster-title text-2xl">Open the escrow on-chain</h3>
      <p className="mt-1 text-sm text-muted">
        One transaction creates the escrow with these {job.milestones.length} milestones. It moves no money yet: you fund each milestone separately.
      </p>
      {missing ? (
        <p className="mt-3 text-sm text-amber-800">{missing}</p>
      ) : (
        <Button className="mt-4" loading={busy} onClick={open}>
          <Icon name="lock" size={16} /> Open escrow
        </Button>
      )}
      {busy && eth.step && <p className="mt-3 text-sm text-gold">{eth.step}</p>}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  );
}

// "What happens next" for whoever is looking, so nobody has to guess their next step.
function NextStep({ job }) {
  const role = job.viewerRole;
  const ms = job.milestones;
  const first = (s) => ms.find((m) => m.status === s);
  let text = "";
  if (role === "client") {
    if (job.status === "open") {
      const toReview = (job.applications || []).filter((a) => a.status === "pending" || a.status === "shortlisted").length;
      text = toReview ? `You have ${toReview} application${toReview > 1 ? "s" : ""} to review. Shortlist, message, then hire.` : "Waiting for applications. Share the link to get more.";
    } else if (job.status === "filled") text = "Every opening is filled. Each hire has their own contract below.";
    else if (first("submitted")) text = `“${first("submitted").title}” was delivered. Review it, then approve or request changes.`;
    else if (first("disputed")) text = "A milestone is in dispute. The arbiter will rule on it.";
    else if (first("pending") && !ms.some((m) => m.status === "funded")) text = `Fund “${first("pending").title}” so ${job.freelancer?.name || "the freelancer"} can start.`;
    else if (first("funded")) text = `${job.freelancer?.name} is working on “${first("funded").title}”.`;
    else if (job.status === "completed") text = job.review ? "All done. Thanks for reviewing." : "All done. Leave a review for the freelancer.";
  } else if (role === "freelancer") {
    const rework = ms.find((m) => m.status === "funded" && m.feedback);
    if (rework) text = `The client asked for changes on “${rework.title}”. Read the note and resubmit.`;
    else if (first("funded")) text = `“${first("funded").title}” is funded. Deliver it when it is ready.`;
    else if (first("submitted")) text = "Your work is with the client for review.";
    else if (first("pending")) text = "Waiting for the client to fund the next milestone.";
    else if (job.status === "completed") text = "Every milestone is paid. Withdraw from the Box office if you are on-chain.";
  }
  if (!text) return null;
  return (
    <p className="mt-6 flex items-start gap-3 border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
      <Icon name="arrow" size={16} className="mt-0.5 text-gold" />
      <span>
        <span className="stat-label !text-gold">Next step</span>
        <span className="block">{text}</span>
      </span>
    </p>
  );
}

function CancelJob({ job, onChange }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const untouched = job.milestones.every((m) => m.status === "pending");
  const allowed = job.viewerRole === "client" && (job.status === "open" || job.status === "filled" || (job.status === "in_progress" && untouched));
  if (!allowed) return null;

  async function cancel() {
    setBusy(true);
    try {
      onChange(await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  const what = job.status === "in_progress" ? "End this contract? Nothing has been funded, so no money moves." : "Close this posting? Pending applicants are declined.";
  return (
    <div className="space-y-2">
      {confirm ? (
        <div className="card space-y-3 p-4 text-sm">
          <p>{what}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={busy} onClick={cancel}>
              Yes, cancel
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
          {job.status === "in_progress" ? "End contract" : "Close posting"}
        </Button>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { user, openLogin, ready } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const chain = useChainConfig();
  const eth = useEscrow();

  // On-chain mode: send the wallet transaction first, then give its hash to the API to verify and mirror.
  const perform = async (m, action, body = {}) => {
    let txHash;
    if (chain) {
      txHash = await eth.onchain(action, {
        escrowId: job.escrowId,
        index: m.position - 1,
        amount: m.amount,
        deliverableUrl: body.deliverableUrl,
        freelancerPercent: body.freelancerPercent,
      });
    }
    return api(`/api/milestones/${m.id}/${action}`, { method: "POST", body: { ...body, txHash } });
  };

  useEffect(() => {
    if (!ready) return;
    const ctl = new AbortController();
    setError("");
    api(`/api/jobs/${id}`, { signal: ctl.signal })
      .then(setJob)
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [id, ready, user?.id]);

  if (error)
    return (
      <div className="container-page pt-16">
        <EmptyState icon="alert" title="Job not found" action={<Button to="/jobs">Back to jobs</Button>}>
          {error}
        </EmptyState>
      </div>
    );
  if (!job)
    return (
      <div className="container-page grid gap-6 pt-12 lg:grid-cols-3">
        <CardSkeleton className="h-96 lg:col-span-2" />
        <CardSkeleton className="h-96" />
      </div>
    );

  const st = jobStatus[job.status] || jobStatus.open;
  const role = job.viewerRole;
  const inEscrow = job.milestones.filter((m) => m.status === "funded" || m.status === "submitted" || m.status === "disputed").reduce((s, m) => s + m.amount, 0);
  const paid = job.milestones.filter((m) => m.status === "released" || m.status === "resolved").reduce((s, m) => s + m.amount, 0);
  const participant = role === "client" || role === "freelancer";
  const posting = job.status === "open" || job.status === "filled" || (job.status === "cancelled" && !job.freelancer);
  const showApplicants = role === "client" && (posting || job.applications?.length > 1);

  return (
    <div className="container-page pb-8 pt-8">
      <Link to={job.parentId ? `/jobs/${job.parentId}` : "/jobs"} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-gold">
        <Icon name="arrow" size={14} className="rotate-180" /> {job.parentId ? `Posting: ${job.parentTitle}` : "All jobs"}
      </Link>

      <header className="mt-4 flex flex-col gap-6 border border-gold/30 bg-surface p-5 sm:flex-row sm:p-6">
        <Poster title={job.title} tilt={-2} demo={job.demo} className="hidden !max-w-[10rem] sm:flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {job.parentId && <Badge tone="blue">Contract</Badge>}
            {role !== "visitor" && <Badge tone="violet">You are the {role}</Badge>}
            {job.demo && <Badge tone="red">Demo data</Badge>}
          </div>
          <h1 className="poster-title mt-3 text-5xl text-gold sm:text-6xl">{job.title}</h1>
          <p className="mt-3 font-serif text-lg italic text-ink-soft">
            Directed by {job.client.name}
            {job.freelancer && `, starring ${job.freelancer.name}`}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Posted {reelDate(job.createdAt)} · {timeAgo(job.createdAt)}
          </p>
          {!job.parentId && <JobFacts job={job} className="mt-4" />}
          <dl className="mt-5 grid max-w-md grid-cols-3 gap-px border border-white/10 bg-white/10">
            {[
              ["Budget", job.total],
              ["In escrow", inEscrow],
              ["Paid out", paid],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0f0e0d] px-4 py-3">
                <dt className="stat-label">{k}</dt>
                <dd className="font-mono font-bold">{usdc(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <NextStep job={job} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-10">
          {showApplicants && <ApplicantsPanel job={job} user={user} onChange={setJob} />}

          <section>
            <h2 className="poster-title text-3xl text-gold">The synopsis</h2>
            <p className="mt-2 whitespace-pre-wrap text-ink-soft">{job.description}</p>
            {job.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <SkillChip key={s}>{s}</SkillChip>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="poster-title text-3xl text-gold">Scenes &amp; milestones</h2>
            {chain ? (
              <p className="mb-4 mt-1 flex items-start gap-2 bg-green-50 px-4 py-3 text-sm text-green-900">
                <Icon name="shield" size={18} className="mt-0.5" />
                <span>
                  Payments are held by the escrow contract <code className="break-all">{chain.escrow}</code> (chain {chain.chainId}). Every step below is a wallet transaction.
                </span>
              </p>
            ) : (
              <p className="mb-4 mt-1 flex items-start gap-2 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Icon name="alert" size={18} className="mt-0.5" />
                <span>Preview mode: no escrow contract is connected to this server, so balances are tracked by the platform and no real USDC moves.</span>
              </p>
            )}
            {job.openings > 1 && !job.parentId && (
              <p className="mb-4 text-sm text-muted">Each person hired gets their own copy of these milestones, funded and paid separately.</p>
            )}
            {chain && role === "client" && job.freelancer && job.escrowId == null && <OpenEscrow job={job} eth={eth} onChange={setJob} />}
            <ol className="space-y-4">
              {job.milestones.map((m) => (
                <MilestoneCard key={m.id} m={m} job={job} user={user} onChange={setJob} perform={perform} step={eth.step} chainOn={!!chain} />
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          {(role === "visitor" || role === "applicant") && <ApplyPanel job={job} user={user} openLogin={openLogin} onChange={setJob} />}
          <ReviewPanel job={job} onChange={setJob} />
          {participant && job.freelancer && <Thread id="chat" path={`/api/jobs/${job.id}/messages`} user={user} />}
          {participant && <Activity events={job.events} />}
          <CancelJob job={job} onChange={setJob} />
        </aside>
      </div>
    </div>
  );
}
