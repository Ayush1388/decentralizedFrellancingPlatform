import { useEffect, useRef, useState } from "react";
import { api, API } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useWalletAuth } from "../lib/useWalletAuth";
import { useDemoLogin } from "../lib/useDemoLogin";
import { Button, ErrorNote, Field, Icon } from "./ui";

export default function LoginPopup() {
  const { loginOpen, closeLogin, signIn } = useAuth();
  const dialogRef = useRef(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const wallet = useWalletAuth();
  const demo = useDemoLogin();

  useEffect(() => {
    api("/api/config").then((c) => setGoogleEnabled(c.googleEnabled)).catch(() => {});
  }, []);

  // Native <dialog> gives us a focus trap, Esc to close and a backdrop for free.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (loginOpen && !d.open) d.showModal();
    if (!loginOpen && d.open) d.close();
  }, [loginOpen]);

  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      signIn(await api(`/api/auth/${mode === "login" ? "login" : "signup"}`, { method: "POST", body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function walletLogin() {
    await wallet.run();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={closeLogin}
      onClick={(e) => e.target === dialogRef.current && closeLogin()}
      aria-labelledby="login-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md border border-gold/40 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-6 sm:p-8">
        <button
          type="button"
          onClick={closeLogin}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center text-muted hover:text-gold"
        >
          <Icon name="x" />
        </button>

        <h2 id="login-title" className="text-2xl font-bold">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "login" ? "Log in to manage jobs and payments." : "Hire developers or find work, paid in USDC."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <Field label="Name" htmlFor="auth-name">
              <input id="auth-name" name="name" autoComplete="name" required minLength={2} value={form.name} onChange={set} className="input" />
            </Field>
          )}
          <Field label="Email" htmlFor="auth-email">
            <input id="auth-email" type="email" name="email" autoComplete="email" required value={form.email} onChange={set} className="input" />
          </Field>
          <Field label="Password" htmlFor="auth-password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <input
              id="auth-password"
              type="password"
              name="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={form.password}
              onChange={set}
              className="input"
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" loading={loading} className="w-full">
            {mode === "login" ? "Log in" : "Create account"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>

        <div className="space-y-3">
          {demo.available && (
            <>
              <Button type="button" variant="outline" className="w-full !border-marker/60 !text-marker" onClick={demo.run} loading={demo.busy}>
                <Icon name="user" size={18} /> Use the demo account
              </Button>
              <ErrorNote>{demo.error}</ErrorNote>
            </>
          )}
          <Button type="button" variant="secondary" className="w-full" onClick={walletLogin} loading={wallet.busy}>
            <Icon name="eth" size={18} /> Continue with Ethereum wallet
          </Button>
          <ErrorNote>{wallet.error}</ErrorNote>
          {googleEnabled && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => (window.location.href = `${API}/api/auth/google`)}>
              <Icon name="globe" size={18} /> Continue with Google
            </Button>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-semibold text-green-800 underline-offset-2 hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </dialog>
  );
}
