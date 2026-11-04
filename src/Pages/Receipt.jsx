import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useChainConfig } from "../context/useChainConfig";
import { usdc } from "../lib/format";
import { explorerTx } from "../lib/wagmi";
import { Button, CardSkeleton, EmptyState, Icon } from "../Components/ui";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "—");

// /jobs/:id/receipt/:milestoneId  A record of one payment, laid out to print or save as a PDF.
export default function Receipt() {
  const { id, mid } = useParams();
  const { user, ready, openLogin } = useAuth();
  const chain = useChainConfig();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !user) return;
    api(`/api/jobs/${id}`)
      .then(setJob)
      .catch((e) => setError(e.message));
  }, [id, ready, user]);

  if (ready && !user)
    return (
      <div className="container-page pt-16">
        <EmptyState as="h1" icon="lock" title="Log in to see this receipt" action={<Button onClick={openLogin}>Log in</Button>} />
      </div>
    );
  if (error)
    return (
      <div className="container-page pt-16">
        <EmptyState as="h1" icon="alert" title="Receipt not found" action={<Button to="/jobs">Back to jobs</Button>}>
          {error}
        </EmptyState>
      </div>
    );
  if (!job)
    return (
      <div className="container-page max-w-2xl pt-12">
        <CardSkeleton className="h-96" />
      </div>
    );

  const m = job.milestones.find((x) => String(x.id) === mid);
  const settled = m && (m.status === "released" || m.status === "resolved");
  if (!m || !settled || (job.viewerRole !== "client" && job.viewerRole !== "freelancer"))
    return (
      <div className="container-page pt-16">
        <EmptyState as="h1" icon="file" title="No receipt for this milestone" action={<Button to={`/jobs/${id}`}>Back to the job</Button>}>
          Receipts exist for milestones that were paid out, and only the two people on the job can see them.
        </EmptyState>
      </div>
    );

  const share = Math.round(((m.freelancerBps ?? 10000) / 10000) * m.amount);
  const fee = Math.floor((share * job.feeBps) / 10000);
  const net = share - fee;
  const refund = m.amount - share;
  const rows = [
    ["Receipt for", `${job.title}: ${m.title}`],
    ["Client", job.client.name],
    ["Freelancer", job.freelancer?.name || "—"],
    ["Milestone amount", usdc(m.amount)],
    ...(m.status === "resolved" ? [["Arbiter ruling", `${(m.freelancerBps ?? 0) / 100}% to the freelancer`]] : []),
    ["Platform fee", `${usdc(fee)} (${job.feeBps / 100}% of the freelancer's share)`],
    ["Paid to freelancer", usdc(net)],
    ...(refund > 0 ? [["Returned to client", usdc(refund)]] : []),
    ["Funded", when(m.fundedAt)],
    ["Delivered", when(m.submittedAt)],
  ];

  return (
    <div className="container-page max-w-2xl pb-16 pt-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/jobs/${id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <Icon name="arrow" size={14} className="rotate-180" /> Back to the job
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Icon name="printer" size={14} /> Print or save as PDF
        </Button>
      </div>

      {/* Light paper on purpose: it prints and reads well on any printer */}
      <article className="receipt bg-ticket p-8 text-poster shadow-[0_30px_70px_-30px_rgb(0_0_0/0.9)] sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b-2 border-dashed border-poster/30 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">The Blockchain Picture House</p>
            <h1 className="poster-title mt-1 text-5xl">Receipt</h1>
          </div>
          <div className="text-right font-mono text-xs">
            <p>No. {String(m.id).padStart(6, "0")}</p>
            <p>{when(m.status === "released" || m.status === "resolved" ? m.submittedAt || m.fundedAt : null)}</p>
          </div>
        </header>
        <dl className="mt-5 divide-y divide-poster/15">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">{k}</dt>
              <dd className="font-mono text-sm font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        {(m.fundTx || m.releaseTx) && (
          <div className="mt-5 border-t-2 border-dashed border-poster/30 pt-4 font-mono text-xs leading-relaxed">
            {m.fundTx && (
              <p className="break-all">
                Funding transaction: {m.fundTx}
                {chain && explorerTx(chain.chainId, m.fundTx) && (
                  <>
                    {" "}
                    <a className="no-print underline" href={explorerTx(chain.chainId, m.fundTx)} target="_blank" rel="noopener noreferrer">
                      view
                    </a>
                  </>
                )}
              </p>
            )}
            {m.releaseTx && (
              <p className="break-all">
                Payment transaction: {m.releaseTx}
                {chain && explorerTx(chain.chainId, m.releaseTx) && (
                  <>
                    {" "}
                    <a className="no-print underline" href={explorerTx(chain.chainId, m.releaseTx)} target="_blank" rel="noopener noreferrer">
                      view
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        )}
        <p className="mt-6 text-xs opacity-70">
          {chain ? "Amounts are in USDC on the network shown by the transactions above." : "Preview mode: this payment was recorded by the platform and no real USDC moved."} This is a record of a
          payment made through the platform, not a tax invoice.
        </p>
      </article>
    </div>
  );
}
