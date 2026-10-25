import { useCallback, useEffect, useState } from "react";
import { API } from "../lib/api";
import { Icon, Spinner } from "./ui";

// Pings the API on load and every 10s while it is down, so a stopped backend
// is explained up front instead of surfacing as scattered request errors.
export default function ApiStatus() {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) });
      setDown(!res.ok);
    } catch {
      setDown(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!down) return;
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [down, check]);

  if (!down) return null;
  return (
    <div role="alert" className="bg-red-700 px-4 py-2.5 text-center text-sm text-white">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Icon name="alert" size={16} />
        <span>
          Can't reach the API at <code className="rounded bg-white/15 px-1.5 py-0.5">{API}</code>. Start it with <code className="rounded bg-white/15 px-1.5 py-0.5">npm run dev</code>.
        </span>
        <button onClick={check} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-3 py-0.5 hover:bg-white/10">
          {checking && <Spinner />} Retry
        </button>
      </span>
    </div>
  );
}
