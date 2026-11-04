import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadProtectedFile } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo, usdc } from "../lib/format";
import { Badge, Button, CardSkeleton, EmptyState, ErrorNote, Icon, SkillChip } from "../Components/ui";
import { Poster, SaveButton } from "../Components/cinema";
import { reelDate } from "../lib/cinema";
import { jobStatus } from "../lib/jobStatus";
import { useChainConfig } from "../context/useChainConfig";
import { friendlyError, useEscrow } from "../lib/useEscrow";
import { usePendingTx } from "../lib/usePendingTx";
import { explorerAddress } from "../lib/wagmi";
import MilestoneCard from "../Components/job/MilestoneCard";
import ApplyPanel from "../Components/job/ApplyPanel";
import ApplicantsPanel from "../Components/job/ApplicantsPanel";
import Activity from "../Components/job/Activity";
import ReviewPanel from "../Components/job/ReviewPanel";
import ManagePanel from "../Components/job/ManagePanel";
import JobFacts from "../Components/job/JobFacts";
import Thread from "../Components/job/Thread";
import ReportButton from "../Components/ReportButton";

function OpenEscrow({ job, eth, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = !job.clientWallet ? "Link your wallet on the Box office page first." : !job.freelancerWallet ? `${job.freelancer.name} has not linked a wallet yet.` : "";

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
    if (job.status === "draft") text = "This is a draft: nobody can see it yet. Review it, then publish.";
    else if (job.status === "open") {
      const toReview = (job.applications || []).filter((a) => a.status === "pending" || a.status === "shortlisted").length;
      text = toReview ? `You have ${toReview} application${toReview > 1 ? "s" : ""} to review. Shortlist, message, then hire.` : "Waiting for applications. Share the link to get more.";
    } else if (job.status === "filled") text = "Every opening is filled. Each hire has their own contract below.";
    else if (first("submitted")) text = `“${first("submitted").title}” was delivered. Review it, then approve or request changes.`;
    else if (first("disputed")) text = "A milestone is in dispute. The arbiter will rule on it.";
    else if (first("pending") && !ms.some((m) => m.status === "funded")) text = `Fund “${first("pending").title}” so ${job.freelancer?.name || "the freelancer"} can start.`;
    else if (first("funded")) text = `${job.freelancer?.name} is working on “${first("funded").title}”.`;
    else if (job.status === "completed") text = job.reviews?.some((r) => r.kind === "client_to_freelancer") ? "All done. Thanks for reviewing." : "All done. Leave a review for the freelancer.";
  } else if (role === "freelancer") {
    const rework = ms.find((m) => m.status === "funded" && m.feedback);
    if (rework) text = `The client asked for changes on “${rework.title}”. Read the note and resubmit.`;
    else if (first("funded")) text = `“${first("funded").title}” is funded. Deliver it when it is ready.`;
    else if (first("submitted")) text = "Your work is with the client for review.";
    else if (first("pending")) text = "Waiting for the client to fund the next milestone.";
    else if (job.status === "completed") text = "Every milestone is paid. If you are on-chain, withdraw from the Box office.";
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

function BriefFiles({ files }) {
  const [error, setError] = useState("");
  if (!files?.length) return null;
  return (
    <div>
      <p className="stat-label mb-2">Files from the client</p>
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => downloadProtectedFile(f.url, f.name).catch((e) => setError(e.message))}
              className="flex items-center gap-2 border border-[#3a3733] px-3 py-2 text-sm hover:border-gold"
            >
              <Icon name="file" size={14} className="text-gold" />
              <span className="max-w-56 truncate">{f.name}</span>
              <span className="text-xs text-muted">{f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`}</span>
            </button>
          </li>
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { user, openLogin, ready } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const chain = useChainConfig();
  const eth = useEscrow();
  const pending = usePendingTx(job, setJob);

  // On-chain mode: send the wallet transaction first, remember it, then give its hash to the API to verify and mirror.
  const perform = async (m, action, body = {}) => {
    let txHash;
    if (chain) {
      txHash = await eth.onchain(action, {
        escrowId: job.escrowId,
        index: m.position - 1,
        amount: m.amount,
        // approve once for every milestone still to fund, so later ones need a single confirmation
        approveAmount: job.milestones.filter((x) => x.status === "pending").reduce((s, x) => s + x.amount, 0),
        deliverableUrl: body.deliverableUrl,
        freelancerPercent: body.freelancerPercent,
      });
      pending.remember({ milestoneId: m.id, action, body, txHash });
    }
    try {
      const updated = await api(`/api/milestones/${m.id}/${action}`, { method: "POST", body: { ...body, txHash } });
      if (txHash) pending.forget(txHash);
      return updated;
    } catch (err) {
      if (txHash && (!err.status || err.status >= 500 || err.status === 409)) {
        // The money moved but the site could not record it. It is remembered and retried; sync is the manual way.
        throw Object.assign(new Error("Your transaction went through, but the site could not record it yet. It will retry automatically the next time you open this job, or press “Sync with blockchain”."), { friendly: true });
      }
      throw err;
    }
  };

  const sync = useCallback(
    async (deliverables) => {
      setSyncNote("");
      const updated = await api(`/api/jobs/${id}/sync`, { method: "POST", body: deliverables ? { deliverables } : undefined });
      setJob(updated);
      return updated;
    },
    [id],
  );

  async function manualSync() {
    setSyncBusy(true);
    try {
      const before = JSON.stringify(job.milestones.map((m) => m.status));
      const updated = await sync();
      setSyncNote(JSON.stringify(updated.milestones.map((m) => m.status)) === before ? "Already up to date with the blockchain." : "Updated to match the blockchain.");
    } catch (err) {
      setSyncNote(err.message);
    } finally {
      setSyncBusy(false);
    }
  }

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
  const posting = job.status === "open" || job.status === "filled" || job.status === "draft" || (job.status === "cancelled" && !job.freelancer);
  const showApplicants = role === "client" && (posting || job.applications?.length > 1);
  const arbiterView = !participant && user?.isAdmin && job.milestones.some((m) => m.status === "disputed");
  const needsWallet = chain && participant && !user?.walletAddress;

  return (
    <div className="container-page pb-8 pt-8">
      <Link to={job.parentId ? `/jobs/${job.parentId}` : "/jobs"} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-gold">
        <Icon name="arrow" size={14} className="rotate-180" /> {job.parentId ? `Posting: ${job.parentTitle}` : "All jobs"}
      </Link>

      <header className="mt-4 flex flex-col gap-6 border border-gold/30 bg-surface p-5 sm:flex-row sm:p-6">
        <Poster title={job.title} tilt={-2} demo={job.demo} className="hidden !max-w-[10rem] sm:flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={job.status === "draft" ? "amber" : st.tone}>{job.status === "draft" ? "Draft" : st.label}</Badge>
            {job.parentId && <Badge tone="blue">Contract</Badge>}
            {role !== "visitor" && <Badge tone="violet">You are the {role}</Badge>}
            {job.demo && <Badge tone="red">Demo data</Badge>}
            {job.category && <Badge tone="gray">{job.category}</Badge>}
            <span className="ml-auto flex items-center gap-2">
              {job.status !== "draft" && <SaveButton jobId={job.id} />}
            </span>
          </div>
          <h1 className="poster-title mt-3 text-5xl text-gold sm:text-6xl">{job.title}</h1>
          <p className="mt-3 font-serif text-lg italic text-ink-soft">
            Directed by {job.client.name}
            {job.clientReviews > 0 && (
              <span className="ml-2 font-mono text-sm not-italic text-gold" title={`${job.clientReviews} review${job.clientReviews === 1 ? "" : "s"} from freelancers`}>
                ★ {job.clientRating.toFixed(1)} ({job.clientReviews})
              </span>
            )}
            {job.freelancer && `, starring ${job.freelancer.name}`}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Posted {reelDate(job.createdAt)} · {timeAgo(job.createdAt)}
          </p>
          {!job.parentId && job.status !== "draft" && <JobFacts job={job} className="mt-4" />}
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

      {needsWallet && (
        <p className="mt-6 border border-amber-800/50 bg-butter/60 px-4 py-3 text-sm">
          This contract is paid on-chain and your account has no linked wallet yet.{" "}
          <Link to="/wallet" className="text-gold underline-offset-2 hover:underline">
            Link your wallet
          </Link>{" "}
          before funding, delivering or withdrawing.
        </p>
      )}
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
            {job.attachments?.length > 0 && (
              <div className="mt-5">
                <BriefFiles files={job.attachments} />
              </div>
            )}
            {!user && !participant && <p className="mt-4 text-xs text-muted">Log in to open the files attached to this job.</p>}
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="poster-title text-3xl text-gold">Scenes &amp; milestones</h2>
              {chain && participant && job.escrowId != null && (
                <div className="text-right">
                  <Button size="sm" variant="outline" loading={syncBusy} onClick={manualSync}>
                    <Icon name="refresh" size={14} /> Sync with blockchain
                  </Button>
                </div>
              )}
            </div>
            {syncNote && <p className="mt-2 text-right text-xs text-muted" role="status">{syncNote}</p>}
            {chain ? (
              <p className="mb-4 mt-1 flex items-start gap-2 bg-green-50 px-4 py-3 text-sm text-green-900">
                <Icon name="shield" size={18} className="mt-0.5" />
                <span>
                  Payments are held by the escrow contract{" "}
                  {explorerAddress(chain.chainId, chain.escrow) ? (
                    <a href={explorerAddress(chain.chainId, chain.escrow)} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                      {chain.escrow}
                    </a>
                  ) : (
                    <code className="break-all">{chain.escrow}</code>
                  )}{" "}
                  (chain {chain.chainId}). Every step below is a wallet transaction.
                </span>
              </p>
            ) : (
              <p className="mb-4 mt-1 flex items-start gap-2 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Icon name="alert" size={18} className="mt-0.5" />
                <span>Preview mode: no escrow contract is connected to this server, so balances are tracked by the platform and no real USDC moves.</span>
              </p>
            )}
            {job.openings > 1 && !job.parentId && job.status !== "in_progress" && (
              <p className="mb-4 text-sm text-muted">Each person hired gets their own copy of these milestones, funded and paid separately.</p>
            )}
            {chain && role === "client" && job.freelancer && job.escrowId == null && <OpenEscrow job={job} eth={eth} onChange={setJob} />}
            <ol className="space-y-4">
              {job.milestones.map((m) => (
                <MilestoneCard key={m.id} m={m} job={job} user={user} onChange={setJob} perform={perform} step={eth.step} chainOn={!!chain} sync={sync} />
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          {(role === "visitor" || role === "applicant") && <ApplyPanel job={job} user={user} openLogin={openLogin} onChange={setJob} />}
          <ReviewPanel job={job} user={user} onChange={setJob} />
          {participant && job.freelancer && <Thread id="chat" path={`/api/jobs/${job.id}/messages`} user={user} />}
          {arbiterView && <Thread id="chat" path={`/api/jobs/${job.id}/messages`} user={user} readOnly title="Messages (arbiter view)" />}
          {(participant || arbiterView) && <Activity events={job.events} />}
          <ManagePanel job={job} onChange={setJob} />
          {user && !participant && job.status !== "draft" && <ReportButton kind="job" targetId={job.id} label="Report this job" />}
        </aside>
      </div>
    </div>
  );
}
