import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "../context/useAuth";

// The API advertises a public demo account when it was started with SEED_DEMO=true.
let configPromise;
const demoConfig = () => (configPromise ??= api("/api/config").then((c) => c.demoLogin || null).catch(() => null));

export function useDemoLogin() {
  const { signIn } = useAuth();
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    demoConfig().then((c) => live && setCreds(c));
    return () => {
      live = false;
    };
  }, []);

  async function run() {
    if (!creds) return false;
    setBusy(true);
    setError("");
    try {
      signIn(await api("/api/auth/login", { method: "POST", body: creds }));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { available: !!creds, email: creds?.email, run, busy, error };
}
