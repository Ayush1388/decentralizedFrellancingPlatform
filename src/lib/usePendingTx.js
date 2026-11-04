import { useCallback, useEffect } from "react";
import { api } from "./api";

// A wallet transaction and the site's record of it are two steps. If the tab closes (or the API is asleep or down)
// in between, the blockchain has moved but the site has not. So the confirmed transaction is remembered here,
// in this browser, until the API has acknowledged it, and is replayed the next time the job page opens.
const key = (jobId) => `pendingTx:${jobId}`;
const read = (jobId) => {
  try {
    return JSON.parse(localStorage.getItem(key(jobId)) || "[]");
  } catch {
    return [];
  }
};
const write = (jobId, list) => {
  try {
    list.length ? localStorage.setItem(key(jobId), JSON.stringify(list)) : localStorage.removeItem(key(jobId));
  } catch {
    /* storage unavailable: the manual sync button still works */
  }
};

export function usePendingTx(job, onJob) {
  const jobId = job?.id;

  const remember = useCallback((entry) => write(jobId, [...read(jobId), entry]), [jobId]);
  const forget = useCallback((txHash) => write(jobId, read(jobId).filter((e) => e.txHash !== txHash)), [jobId]);

  // Replay anything left over from last time.
  useEffect(() => {
    if (!jobId) return;
    const left = read(jobId);
    if (!left.length) return;
    let live = true;
    (async () => {
      for (const e of left) {
        try {
          const updated = await api(`/api/milestones/${e.milestoneId}/${e.action}`, { method: "POST", body: { ...e.body, txHash: e.txHash } });
          forget(e.txHash);
          if (live) onJob(updated);
        } catch (err) {
          // 4xx means the site already knows, or it can never apply: either way stop replaying. Network errors stay for next time.
          if (err.status >= 400 && err.status < 500) forget(e.txHash);
        }
      }
    })();
    return () => {
      live = false;
    };
    // run once per job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { remember, forget };
}
