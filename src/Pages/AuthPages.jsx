import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { Button, ErrorNote, Field, PageHeader, Spinner } from "../Components/ui";

// /verify?token=...  The link in the confirmation email.
export function VerifyEmail() {
  const [params] = useSearchParams();
  const { refresh, openLogin, user } = useAuth();
  const [state, setState] = useState("working"); // working | ok | failed
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("failed");
      setMessage("This link is missing its token.");
      return;
    }
    api("/api/auth/verify", { method: "POST", body: { token } })
      .then(() => {
        setState("ok");
        refresh?.();
      })
      .catch((e) => {
        setState("failed");
        setMessage(e.message);
      });
  }, [params, refresh]);

  return (
    <div className="container-page max-w-2xl pb-16">
      <PageHeader eyebrow="Your account" title="Confirm email" />
      {state === "working" && (
        <p className="flex items-center gap-3">
          <Spinner /> Checking your link…
        </p>
      )}
      {state === "ok" && (
        <div className="card space-y-4 p-6">
          <p className="text-lg">Your email is confirmed. You can now post jobs and apply.</p>
          {user ? <Button to="/dashboard">Go to your seat</Button> : <Button onClick={openLogin}>Log in</Button>}
        </div>
      )}
      {state === "failed" && (
        <div className="card space-y-4 p-6">
          <ErrorNote>{message}</ErrorNote>
          <p className="text-sm text-muted">Log in and use “Resend confirmation” from the banner at the top of any page to get a new link.</p>
          <Button onClick={openLogin}>Log in</Button>
        </div>
      )}
    </div>
  );
}

// /reset?token=...  The link in the password reset email.
export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password !== again) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      signIn(await api("/api/auth/reset", { method: "POST", body: { token: params.get("token") || "", password } }));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="container-page max-w-xl pb-16">
      <PageHeader eyebrow="Your account" title="New password" subtitle="Choose a new password. Every other device will be signed out." />
      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="New password" htmlFor="np" hint="At least 8 characters.">
          <input id="np" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </Field>
        <Field label="Repeat it" htmlFor="np2">
          <input id="np2" type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} className="input" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={busy}>
          Save and log in
        </Button>
      </form>
    </div>
  );
}
