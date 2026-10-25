import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { shortDate, timeAgo, usdc } from "../lib/format";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, ErrorNote, Field, Icon, SkillChip } from "../Components/ui";
import { Poster } from "../Components/cinema";
import { reelDate } from "../lib/cinema";
import { jobStatus } from "../lib/jobStatus";
import { useChainConfig } from "../context/useChainConfig";
import { friendlyError, useEscrow } from "../lib/useEscrow";

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

function MilestoneCard({ m, job, user, onChange, perform, step, chainOn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [pct, setPct] = useState(50);
  const st = msStatus[m.status];
  const role = job.viewerRole;
  const fee = (m.amount * job.feeBps) / 10000;

  async function act(action, body) {
    setBusy(true);
    setError("");
    try {
      onChange(await perform(m, action, body));
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
          <p className="font-mono text-xs text-gold">Scene {m.position}</p>
          <h3 className="poster-title text-2xl">{m.title}</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold">{usdc(m.amount)}</p>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>

      {m.deliverableUrl && (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Icon name="link" size={16} className="text-green-700" />
          <a href={m.deliverableUrl} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-green-800 underline-offset-2 hover:underline">
            {m.deliverableUrl}
          </a>
        </p>
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
      {m.status === "resolved" && m.freelancerBps != null && (
        <p className="mt-2 text-sm text-muted">The arbiter awarded {m.freelancerBps / 100}% to the freelancer.</p>
      )}
      {m.status === "released" && role === "freelancer" && (
        <p className="mt-2 text-sm text-muted">
          You receive {usdc(m.amount - fee)} after the {job.feeBps / 100}% platform fee.
        </p>
      )}

      {/* Freelancer: submit work */}
      {role === "freelancer" && m.status === "funded" && (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            act("submit", { deliverableUrl: url });
          }}
        >
          <div className="flex-1">
            <Field label="Link to your deliverable" htmlFor={`del-${m.id}`}>
              <input id={`del-${m.id}`} required type="url" placeholder="https://github.com/… or ipfs://…" value={url} onChange={(e) => setUrl(e.target.value)} className="input" />
            </Field>
          </div>
          <Button type="submit" loading={busy}>
            Submit work
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
        {role === "client" && m.status === "pending" && job.freelancer && (
          <Button size="sm" loading={busy} disabled={chainOn && job.escrowId == null} onClick={() => act("fund")}>
            <Icon name="lock" size={16} /> Fund {usdc(m.amount)}
          </Button>
        )}
        {role === "client" && m.status === "submitted" && (
          <Button size="sm" loading={busy} onClick={() => act("approve")}>
            <Icon name="check" size={16} /> Approve & release
          </Button>
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
          <Button size="sm" variant="danger" loading={busy} onClick={() => act("dispute")}>
            Open dispute
          </Button>
        )}
      </div>

      {/* Arbiter */}
      {user?.isAdmin && m.status === "disputed" && (
        <form
          className="mt-4 rounded-xl bg-red-50 p-4"
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

      {busy && step && <p className="mt-3 text-sm text-green-800">{step}</p>}
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </li>
  );
}

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
      {busy && eth.step && <p className="mt-3 text-sm text-green-800">{eth.step}</p>}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  );
}

function Chat({ jobId, user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const end = useRef(null);

  const load = useCallback(() => api(`/api/jobs/${jobId}/messages`).then(setMessages).catch(() => {}), [jobId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const m = await api(`/api/jobs/${jobId}/messages`, { method: "POST", body: { body: text } });
      setMessages((ms) => [...ms, m]);
      setText("");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section id="chat" className="card flex scroll-mt-24 flex-col p-5" aria-label="Job chat">
      <h2 className="poster-title mb-3 flex items-center gap-2 text-2xl">
        <Icon name="chat" size={18} /> Messages
      </h2>
      <div className="max-h-80 min-h-32 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender.id === user?.id;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${mine ? "bg-gold text-poster" : "bg-sage"}`}>{m.body}</p>
              <span className="mt-0.5 text-[11px] text-muted">
                {mine ? "You" : m.sender.name} · {timeAgo(m.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a message" className="input" />
        <Button type="submit" aria-label="Send message" className="!px-4">
          <Icon name="send" size={18} />
        </Button>
      </form>
      <div className="mt-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}

function ApplyBox({ job, onChange, openLogin, user }) {
  const [cover, setCover] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (job.myApplication) {
    return (
      <div className="card p-5">
        <h2 className="poster-title text-2xl">Your application</h2>
        <Badge tone={job.myApplication.status === "accepted" ? "green" : job.myApplication.status === "declined" ? "red" : "amber"} className="mt-2">
          {job.myApplication.status === "pending" ? "Awaiting client" : job.myApplication.status}
        </Badge>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{job.myApplication.cover}</p>
      </div>
    );
  }
  if (job.status !== "open") return null;
  if (!user) {
    return (
      <div className="card p-5">
        <h2 className="poster-title text-2xl">Interested in this job?</h2>
        <p className="mt-1 text-sm text-muted">Log in to send the client a cover note.</p>
        <Button className="mt-4 w-full" onClick={openLogin}>
          Log in to apply
        </Button>
      </div>
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/jobs/${job.id}/apply`, { method: "POST", body: { cover } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="poster-title text-2xl">Apply to this job</h2>
      <Field label="Cover note" htmlFor="cover" hint="Tell the client why you are a fit (20+ characters).">
        <textarea id="cover" required minLength={20} maxLength={2000} rows={5} value={cover} onChange={(e) => setCover(e.target.value)} className="input" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" loading={busy} className="w-full">
        Send application
      </Button>
    </form>
  );
}

function Applications({ job, onChange }) {
  const chain = useChainConfig();
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  async function hire(id) {
    setBusy(id);
    setError("");
    try {
      onChange(await api(`/api/jobs/${job.id}/hire`, { method: "POST", body: { applicationId: id } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(0);
    }
  }
  return (
    <section className="card p-5" aria-label="Applications">
      <h2 className="poster-title text-2xl">Applications ({job.applications?.length || 0})</h2>
      {!job.applications?.length && <p className="mt-2 text-sm text-muted">No applications yet. Freelancers will appear here.</p>}
      <ul className="mt-3 space-y-4">
        {job.applications?.map((a) => (
          <li key={a.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-3">
              <Avatar seed={a.user.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.user.name}</p>
                <p className="text-xs text-muted">{timeAgo(a.createdAt)}</p>
              </div>
              {a.status !== "pending" && <Badge tone={a.status === "accepted" ? "green" : "gray"}>{a.status}</Badge>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.cover}</p>
            {job.status === "open" && (
              <>
                <Button size="sm" className="mt-3" loading={busy === a.id} disabled={chain && !a.hasWallet} onClick={() => hire(a.id)}>
                  Hire {a.user.name.split(" ")[0]}
                </Button>
                {chain && !a.hasWallet && <p className="mt-2 text-xs text-amber-800">No wallet linked yet, so they cannot be paid on-chain.</p>}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
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

  const st = jobStatus[job.status];
  const role = job.viewerRole;
  const inEscrow = job.milestones.filter((m) => m.status === "funded" || m.status === "submitted" || m.status === "disputed").reduce((s, m) => s + m.amount, 0);
  const paid = job.milestones.filter((m) => m.status === "released" || m.status === "resolved").reduce((s, m) => s + m.amount, 0);
  const participant = role === "client" || role === "freelancer";

  async function cancel() {
    try {
      setJob(await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container-page pb-8 pt-8">
      <Link to="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-green-800">
        <Icon name="arrow" size={14} className="rotate-180" /> All jobs
      </Link>

      <header className="mt-4 flex flex-col gap-6 border border-gold/30 bg-surface p-5 sm:flex-row sm:p-6">
        <Poster title={job.title} tilt={-2} className="hidden !max-w-[10rem] sm:flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {role !== "visitor" && <Badge tone="violet">You are the {role}</Badge>}
          </div>
          <h1 className="poster-title mt-3 text-5xl text-gold sm:text-6xl">{job.title}</h1>
          <p className="mt-3 font-serif text-lg italic text-ink-soft">
            Directed by {job.client.name}
            {job.freelancer && `, starring ${job.freelancer.name}`}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {reelDate(job.createdAt)} · {timeAgo(job.createdAt)}
          </p>
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section>
            <h2 className="poster-title text-3xl text-gold">The synopsis</h2>
            <p className="mt-2 whitespace-pre-wrap text-ink-soft">{job.description}</p>
            {job.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
                {job.skills.map((s) => (
                  <SkillChip key={s}>{s}</SkillChip>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="poster-title text-3xl text-gold">Scenes &amp; milestones</h2>
            {chain ? (
              <p className="mb-4 mt-1 flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
                <Icon name="shield" size={18} className="mt-0.5" />
                <span>
                  Payments are held by the escrow contract <code className="break-all">{chain.escrow}</code> (chain {chain.chainId}). Every step below is a wallet transaction.
                </span>
              </p>
            ) : (
              <p className="mb-4 mt-1 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Icon name="alert" size={18} className="mt-0.5" />
                <span>Preview mode: no escrow contract is connected to this server, so balances are tracked by the platform and no real USDC moves.</span>
              </p>
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
          {role === "client" && <Applications job={job} onChange={setJob} />}
          {role !== "client" && role !== "freelancer" && <ApplyBox job={job} onChange={setJob} openLogin={openLogin} user={user} />}
          {participant && job.freelancer && <Chat jobId={job.id} user={user} />}
          {role === "client" && job.status === "open" && (
            <Button variant="danger" size="sm" onClick={cancel}>
              Cancel this job
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
