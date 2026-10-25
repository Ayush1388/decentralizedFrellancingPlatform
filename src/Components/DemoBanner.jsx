import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useDemoLogin } from "../lib/useDemoLogin";
import { Icon } from "./ui";

// Strip under the nav while the API serves demo data, with a one-click way into the demo account.
export default function DemoBanner() {
  const { user } = useAuth();
  const demo = useDemoLogin();
  const navigate = useNavigate();
  if (!demo.available) return null;

  const inDemo = user?.email === demo.email;
  return (
    <div className="border-b border-marker/30 bg-[#1a0d0e] text-sm">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
        <p className="flex items-center gap-3 text-ink-soft">
          <span className="-rotate-3 border-2 border-marker px-1.5 font-hand text-xs leading-tight text-marker">Demo</span>
          {inDemo ? "You are watching as the demo client. Everything here is sample data." : "Jobs and developers stamped DEMO are sample data for showcasing the platform."}
        </p>
        {!inDemo && (
          <button
            onClick={async () => (await demo.run()) && navigate("/dashboard")}
            disabled={demo.busy}
            className="eyebrow inline-flex items-center gap-2 text-gold hover:underline disabled:opacity-60"
          >
            {demo.busy ? "Opening…" : "Watch as the demo client"} <Icon name="arrow" size={14} />
          </button>
        )}
        {demo.error && <p className="w-full text-xs text-red-700">{demo.error}</p>}
      </div>
    </div>
  );
}
