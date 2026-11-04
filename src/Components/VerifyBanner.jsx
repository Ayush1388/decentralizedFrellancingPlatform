import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useSiteConfig } from "../lib/siteConfig";

// Shown under the top bar while the signed-in account has an email that is not confirmed yet.
export default function VerifyBanner() {
  const { user } = useAuth();
  const site = useSiteConfig();
  const [state, setState] = useState("idle"); // idle | sending | sent | failed
  if (!site.emailEnabled || !user?.email || user.emailVerified) return null;

  async function resend() {
    setState("sending");
    try {
      await api("/api/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="border-b border-amber-800/40 bg-butter text-sm" role="status">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
        <p>
          Confirm your email ({user.email}) to post jobs and apply. {state === "sent" && <strong>A new link is on its way.</strong>}
          {state === "failed" && <strong className="text-red-700">Could not send it right now.</strong>}
        </p>
        <button onClick={resend} disabled={state === "sending" || state === "sent"} className="min-h-8 font-medium text-gold hover:underline disabled:opacity-60">
          {state === "sending" ? "Sending…" : "Resend confirmation"}
        </button>
      </div>
    </div>
  );
}
