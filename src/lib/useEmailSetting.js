import { useEffect, useState } from "react";
import { api, getToken } from "./api";
import { useAuth } from "../context/useAuth";

let enabledPromise;
const serverHasEmail = () => (enabledPromise ??= api("/api/config").then((c) => !!c.emailEnabled).catch(() => false));

// Whether the server sends email at all, and the signed-in user's own on/off switch.
export function useEmailSetting() {
  const { user, signIn } = useAuth();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    serverHasEmail().then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, []);

  async function set(enabled) {
    setBusy(true);
    setError("");
    try {
      const updated = await api("/api/auth/notifications", { method: "POST", body: { enabled } });
      signIn({ token: getToken(), user: updated });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return { available: available && !!user?.email, enabled: !!user?.notifyEmail, busy, error, set };
}
