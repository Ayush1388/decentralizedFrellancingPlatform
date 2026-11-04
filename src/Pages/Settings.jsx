import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, api, getToken } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useEmailSetting } from "../lib/useEmailSetting";
import { useSiteConfig } from "../lib/siteConfig";
import { shortAddr } from "../lib/format";
import { Badge, Button, EmptyState, ErrorNote, Field, PageHeader } from "../Components/ui";

function Section({ title, children, danger }) {
  return (
    <section className={`card space-y-4 p-6 ${danger ? "!border-red-700/50" : ""}`}>
      <h2 className="text-[1.375rem] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Note({ children }) {
  return children ? <p className="border border-gold/30 bg-gold/10 px-3 py-2 text-sm">{children}</p> : null;
}

function EmailSection({ user }) {
  const { setUser } = useAuth();
  const site = useSiteConfig();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setUser(await api("/api/auth/email", { method: "POST", body: { email } }));
      setMsg(site.emailEnabled ? "Saved. We sent a confirmation link to that address." : "Saved.");
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/resend-verification", { method: "POST" });
      setMsg("Confirmation link sent. Check your inbox and spam folder.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Email">
      {user.email ? (
        <p className="flex flex-wrap items-center gap-3">
          <span className="tabular-nums">{user.email}</span>
          {site.emailEnabled && <Badge tone={user.emailVerified ? "green" : "amber"}>{user.emailVerified ? "Confirmed" : "Not confirmed"}</Badge>}
          {site.emailEnabled && !user.emailVerified && (
            <Button size="sm" variant="secondary" loading={busy} onClick={resend}>
              Resend confirmation
            </Button>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted">No email on this account. Add one to get notifications and to recover your account.</p>
      )}
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={user.email ? "Change email" : "Add an email"} htmlFor="new-email">
            <input id="new-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </Field>
        </div>
        <Button type="submit" loading={busy} variant="secondary">
          Save email
        </Button>
      </form>
      <Note>{msg}</Note>
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}

function PasswordSection({ user }) {
  const { signIn } = useAuth();
  const [f, setF] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      signIn(await api("/api/auth/password", { method: "POST", body: f }));
      setMsg("Password changed. Every other device has been signed out.");
      setF({ current: "", next: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title={user.hasPassword ? "Password" : "Add a password"}>
      {!user.hasPassword && <p className="text-sm text-muted">You sign in with a wallet or Google. A password is optional; add one if you also want to log in with your email.</p>}
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {user.hasPassword && (
          <Field label="Current password" htmlFor="cur-pw">
            <input id="cur-pw" type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} className="input" />
          </Field>
        )}
        <Field label="New password" htmlFor="new-pw" hint="At least 8 characters.">
          <input id="new-pw" type="password" autoComplete="new-password" required minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} variant="secondary">
            Save password
          </Button>
        </div>
      </form>
      <Note>{msg}</Note>
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}

export default function Settings() {
  const { user, ready, openLogin, signOut } = useAuth();
  const navigate = useNavigate();
  const email = useEmailSetting();
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [del, setDel] = useState({ open: false, password: "", confirm: "", busy: false });

  if (ready && !user)
    return (
      <div className="container-page pt-12">
        <EmptyState as="h1" icon="lock" title="Log in to open your settings" action={<Button onClick={openLogin}>Log in</Button>} />
      </div>
    );
  if (!user) return null;

  async function logoutAll() {
    setError("");
    try {
      await api("/api/auth/logout-all", { method: "POST" });
      signOut();
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  // A plain link cannot carry the login token, so the file is fetched and saved from here.
  async function download() {
    setError("");
    try {
      const res = await fetch(`${API}/api/auth/export`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("Could not export your data");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: "my-data.json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg("Your data was downloaded as my-data.json.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(e) {
    e.preventDefault();
    setDel((d) => ({ ...d, busy: true }));
    setError("");
    try {
      await api("/api/auth/delete", { method: "POST", body: { password: del.password, confirm: del.confirm } });
      signOut();
      navigate("/");
    } catch (err) {
      setError(err.message);
      setDel((d) => ({ ...d, busy: false }));
    }
  }

  return (
    <div className="container-page max-w-3xl space-y-6 pb-16">
      <PageHeader title="Settings" subtitle={`Signed in as ${user.name}.`} />

      <EmailSection user={user} />
      <PasswordSection user={user} />

      <Section title="Wallet">
        {user.walletAddress ? (
          <p className="flex flex-wrap items-center gap-3">
            <span className="font-mono" title={user.walletAddress}>
              {shortAddr(user.walletAddress)}
            </span>
            <Badge tone="green">Linked</Badge>
          </p>
        ) : (
          <p className="text-sm text-muted">No wallet linked yet. You need one to be hired or to fund work on-chain.</p>
        )}
        <Button to="/wallet" variant="secondary" size="sm">
          Open the Wallet page
        </Button>
      </Section>

      <Section title="Notifications">
        {email.available ? (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={email.enabled} disabled={email.busy} onChange={(e) => email.set(e.target.checked)} className="h-4 w-4 accent-[#f2c230]" />
            Email me when something needs my action
          </label>
        ) : (
          <p className="text-sm text-muted">Email notifications are off on this server, or your account has no email. In-app notifications always work: look at the bell in the top bar.</p>
        )}
        <ErrorNote>{email.error}</ErrorNote>
      </Section>

      <Section title="Security">
        <p className="text-sm text-muted">Signs you out on every device, including this one. Use it if you lost a phone or used a shared computer.</p>
        <Button variant="secondary" size="sm" onClick={logoutAll}>
          Sign out everywhere
        </Button>
      </Section>

      <Section title="Your data">
        <p className="text-sm text-muted">
          Download everything the platform holds about you as a file, or delete your account. Read the{" "}
          <Link to="/privacy" className="text-gold underline-offset-2 hover:underline">
            privacy policy
          </Link>{" "}
          for what is kept and why.
        </p>
        <Button variant="secondary" size="sm" onClick={download}>
          Download my data
        </Button>
      </Section>

      <Section title="Delete account" danger>
        <p className="text-sm text-muted">
          Removes your profile, resume files, saved jobs and email, and closes your open postings. Jobs you worked on stay in the other person&apos;s history under the name
          “Deleted user”. You cannot delete while a contract still has money in play: finish or settle it first.
        </p>
        {!del.open ? (
          <Button variant="danger" size="sm" onClick={() => setDel({ ...del, open: true })}>
            Delete my account
          </Button>
        ) : (
          <form onSubmit={remove} className="space-y-4 border border-red-700/40 p-4">
            {user.hasPassword && (
              <Field label="Your password" htmlFor="del-pw">
                <input id="del-pw" type="password" required value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} className="input" />
              </Field>
            )}
            <Field label="Type DELETE to confirm" htmlFor="del-confirm">
              <input id="del-confirm" required value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} className="input" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" size="sm" loading={del.busy} disabled={del.confirm !== "DELETE"}>
                Delete forever
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDel({ open: false, password: "", confirm: "", busy: false })}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Section>

      <Note>{msg}</Note>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
