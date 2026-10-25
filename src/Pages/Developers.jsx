import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import DeveloperCard from "../Components/DeveloperCard";
import { Button, CardSkeleton, EmptyState, ErrorNote, Field, Icon, PageHeader } from "../Components/ui";

const emptyForm = { name: "", title: "", hourlyRate: "", bio: "", skills: "" };

function ProfileForm({ initial, editing, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    if (image) body.append("image", image);
    try {
      const saved = await api(editing ? `/api/developers/${editing}` : "/api/developers", { method: editing ? "PUT" : "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-10 grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
      <h2 className="text-xl font-bold sm:col-span-2">{editing ? "Edit your profile" : "Create your developer profile"}</h2>
      <Field label="Full name" htmlFor="dev-name">
        <input id="dev-name" name="name" required minLength={2} maxLength={80} value={form.name} onChange={set} className="input" />
      </Field>
      <Field label="Title" htmlFor="dev-title" hint="e.g. Full-stack Web3 developer">
        <input id="dev-title" name="title" required maxLength={100} value={form.title} onChange={set} className="input" />
      </Field>
      <Field label="Hourly rate (USDC)" htmlFor="dev-rate">
        <input id="dev-rate" type="number" name="hourlyRate" required min="1" max="10000" inputMode="numeric" value={form.hourlyRate} onChange={set} className="input" />
      </Field>
      <Field label="Skills" htmlFor="dev-skills" hint="Comma separated, e.g. Solidity, React, Go">
        <input id="dev-skills" name="skills" value={form.skills} onChange={set} className="input" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Short bio" htmlFor="dev-bio" hint={`${form.bio.length}/600`}>
          <textarea id="dev-bio" name="bio" rows={3} maxLength={600} value={form.bio} onChange={set} className="input" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Profile photo" htmlFor="dev-image" hint="JPEG, PNG or WebP, up to 2 MB.">
          <input
            id="dev-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setImage(e.target.files[0] || null)}
            className="input file:mr-3 file:mr-3 file:border-0 file:bg-gold file:px-3 file:py-1 file:font-semibold file:text-poster"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={saving}>
          {editing ? "Save changes" : "Publish profile"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default function Developers() {
  const { user, openLogin } = useAuth();
  const [devs, setDevs] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    (signal) =>
      api(`/api/developers${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`, { signal })
        .then((d) => {
          setDevs(d);
          setError("");
        })
        .catch((e) => e.name !== "AbortError" && setError(e.message)),
    [debounced],
  );

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  const mine = user && devs?.find((d) => d.userId === user.id);

  function saved() {
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function remove() {
    if (!mine) return;
    await api(`/api/developers/${mine.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="container-page pb-8">
      <PageHeader
        eyebrow="Casting office"
        title="The cast"
        image="/Working-bro.png"
        subtitle="Browse developers by skill and rate. Every hire is protected by milestone escrow."
        action={
          !mine && (
            <Button onClick={() => (user ? setShowForm(true) : openLogin())}>
              <Icon name="plus" size={18} /> List yourself
            </Button>
          )
        }
      />

      {(showForm || editing) && user && (
        <ProfileForm
          initial={editing ? { name: editing.name, title: editing.title, hourlyRate: editing.hourlyRate, bio: editing.bio, skills: editing.skills.join(", ") } : { ...emptyForm, name: user.name }}
          editing={editing?.id}
          onSaved={saved}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <div className="relative mb-8 max-w-md">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <label htmlFor="dev-search" className="sr-only">
          Search developers
        </label>
        <input id="dev-search" type="search" placeholder="Search by name, skill or title" value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-11" />
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy={devs === null}>
        {devs === null && !error && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        {devs?.map((d) => <DeveloperCard key={d.id} dev={d} isMine={d.id === mine?.id} onEdit={setEditing} />)}
      </div>

      {devs?.length === 0 && (
        <EmptyState image="/Working remotely-rafiki.svg" title={debounced ? "No developers match your search" : "No developers yet"}>
          {debounced ? "Try a different skill or clear the search." : "Be the first to publish a profile."}
        </EmptyState>
      )}

      {mine && (
        <p className="mt-10 text-sm text-muted">
          Want to take your profile down?{" "}
          <button className="font-semibold text-red-700 underline-offset-2 hover:underline" onClick={remove}>
            Delete my profile
          </button>
        </p>
      )}
    </div>
  );
}
