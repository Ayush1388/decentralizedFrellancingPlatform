import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useWalletAuth } from "../lib/useWalletAuth";
import { useDemoLogin } from "../lib/useDemoLogin";
import { useSiteConfig } from "../lib/siteConfig";
import { Button, ErrorNote, Field, Icon } from "./ui";
import Turnstile from "./Turnstile";

export default function LoginPopup() {
  const { loginOpen, closeLogin, signIn } = useAuth();
  const dialogRef = useRef(null);
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const wallet = useWalletAuth();
  const demo = useDemoLogin();
  const site = useSiteConfig();

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
  const onToken = useCallback((t) => setCaptcha(t), []);
  const switchMode = (m) => {
    setMode(m);
    setError("");
    setSent(false);
  };
  const needsCaptcha = !!site.turnstileSiteKey && mode !== "login";

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && !accepted) {
      setError("Please accept the terms and privacy policy to create an account.");
      return;
    }
    if (needsCaptcha && !captcha) {
      setError("Please complete the human check.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "forgot") {
        await api("/api/auth/forgot", { method: "POST", body: { email: form.email, captcha } });
        setSent(true);
      } else if (mode === "login") {
        signIn(await api("/api/auth/login", { method: "POST", body: { email: form.email, password: form.password } }));
      } else {
        signIn(await api("/api/auth/signup", { method: "POST", body: { ...form, acceptTerms: accepted, captcha } }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const title = { login: "Welcome back", signup: "Create your account", forgot: "Reset your password" }[mode];
  const sub = {
    login: "Log in to manage jobs and payments.",
    signup: "Hire developers or find work, paid in USDC.",
    forgot: "Enter your email and we will send you a link to choose a new password.",
  }[mode];

  return (
    <dialog
      ref={dialogRef}
      onClose={closeLogin}
      onClick={(e) => e.target === dialogRef.current && closeLogin()}
      aria-labelledby="login-title"
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto border border-gold/40 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-6 sm:p-8">
        <button type="button" onClick={closeLogin} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center text-muted hover:text-gold">
          <Icon name="x" />
        </button>

        <h2 id="login-title" className="poster-title text-4xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="border border-gold/40 bg-gold/10 px-4 py-3 text-sm">If an account uses {form.email}, a reset link is on its way. It works for one hour. Check your spam folder too.</p>
            <Button className="w-full" variant="secondary" onClick={() => switchMode("login")}>
              Back to log in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <Field label="Name" htmlFor="auth-name">
                <input id="auth-name" name="name" autoComplete="name" required minLength={2} value={form.name} onChange={set} className="input" />
              </Field>
            )}
            <Field label="Email" htmlFor="auth-email">
              <input id="auth-email" type="email" name="email" autoComplete="email" required value={form.email} onChange={set} className="input" />
            </Field>
            {mode !== "forgot" && (
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
            )}
            {mode === "login" && (
              <button type="button" className="text-xs text-gold underline-offset-2 hover:underline" onClick={() => switchMode("forgot")}>
                Forgot your password?
              </button>
            )}
            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#f2c230]" />
                <span>
                  I agree to the{" "}
                  <Link to="/terms" target="_blank" className="text-gold underline-offset-2 hover:underline">
                    terms
                  </Link>{" "}
                  and the{" "}
                  <Link to="/privacy" target="_blank" className="text-gold underline-offset-2 hover:underline">
                    privacy policy
                  </Link>
                  .
                </span>
              </label>
            )}
            {needsCaptcha && <Turnstile siteKey={site.turnstileSiteKey} onToken={onToken} />}
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" loading={loading} className="w-full">
              {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>
        )}

        {mode !== "forgot" && (
          <>
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
              <Button type="button" variant="secondary" className="w-full" onClick={() => wallet.run()} loading={wallet.busy}>
                <Icon name="eth" size={18} /> Continue with a crypto wallet
              </Button>
              <ErrorNote>{wallet.error}</ErrorNote>
              {googleEnabled && (
                <Button type="button" variant="secondary" className="w-full" onClick={() => (window.location.href = `${API}/api/auth/google`)}>
                  <Icon name="globe" size={18} /> Continue with Google
                </Button>
              )}
              {googleEnabled && (
                <p className="text-center text-xs text-muted">
                  By continuing with Google you agree to the{" "}
                  <Link to="/terms" className="text-gold underline-offset-2 hover:underline" onClick={closeLogin}>terms</Link> and{" "}
                  <Link to="/privacy" className="text-gold underline-offset-2 hover:underline" onClick={closeLogin}>privacy policy</Link>.
                </p>
              )}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" className="font-semibold text-gold underline-offset-2 hover:underline" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </dialog>
  );
}
