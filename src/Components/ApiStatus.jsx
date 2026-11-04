import { useCallback, useEffect, useState } from "react";
import { API } from "../lib/api";
import { Icon, Spinner } from "./ui";

const local = /localhost|127\.0\.0\.1/.test(API);

// Pings the API on load and every few seconds while it is down. A hosted API on a free plan sleeps when idle and
// takes up to a minute to wake, so visitors are told that, and only a developer running it locally gets the command.
export default function ApiStatus() {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tries, setTries] = useState(0);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(8000) });
      setDown(!res.ok);
    } catch {
      setDown(true);
    } finally {
      setChecking(false);
      setTries((t) => t + 1);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!down) return;
    const t = setInterval(check, 6000);
    return () => clearInterval(t);
  }, [down, check]);

  if (!down) return null;
  // After about a minute and a half of retries it is not just waking up any more.
  const stuck = tries > 12;
  return (
    <div role="status" className="border-b border-amber-800/40 bg-butter px-4 py-2.5 text-center text-sm text-ink">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {checking ? <Spinner className="text-gold" /> : <Icon name="clock" size={16} className="text-gold" />}
        {local ? (
          <span>
            The API at <code className="rounded bg-white/10 px-1.5 py-0.5">{API}</code> is not answering. Start it with{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">npm run dev</code>.
          </span>
        ) : stuck ? (
          <span>The server is not answering. Try again in a few minutes.</span>
        ) : (
          <span>The server is waking up after a quiet spell. This can take up to a minute, and the page will connect by itself.</span>
        )}
        <button onClick={check} disabled={checking} className="inline-flex min-h-8 items-center rounded-lg border border-amber-800/50 px-3 font-medium hover:bg-white/5 disabled:opacity-60">
          Retry now
        </button>
      </span>
    </div>
  );
}
