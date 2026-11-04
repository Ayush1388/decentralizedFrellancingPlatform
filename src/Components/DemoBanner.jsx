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
    <div className="border-b border-line bg-[#170f10] text-sm">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-2">
        <p className="flex items-center gap-2.5 text-ink-soft">
          <span className="rounded-full bg-red-300/30 px-2 py-0.5 text-xs font-medium text-red-700">Demo</span>
          {inDemo ? "You're signed in to the demo client account. Everything here is sample data." : "Jobs and developers marked Demo are sample data."}
        </p>
        {!inDemo && (
          <button
            onClick={async () => (await demo.run()) && navigate("/dashboard")}
            disabled={demo.busy}
            className="inline-flex min-h-8 items-center gap-1.5 font-medium text-gold hover:underline disabled:opacity-60"
          >
            {demo.busy ? "Opening…" : "Try it as the demo client"}
            <Icon name="arrow" size={14} />
          </button>
        )}
        {demo.error && <p className="w-full text-xs text-red-700">{demo.error}</p>}
      </div>
    </div>
  );
}
