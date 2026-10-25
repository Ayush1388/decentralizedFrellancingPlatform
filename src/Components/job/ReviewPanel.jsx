import { useState } from "react";
import { api } from "../../lib/api";
import { Button, ErrorNote, Field, Icon } from "../ui";

function Stars({ value, onPick }) {
  return (
    <div className="flex gap-1" role={onPick ? "radiogroup" : "img"} aria-label={onPick ? "Rating" : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onPick(n)}
            className="flex h-10 w-10 items-center justify-center text-gold"
          >
            <Icon name="star" size={24} className={n <= value ? "fill-current" : ""} />
          </button>
        ) : (
          <Icon key={n} name="star" size={16} className={`text-gold ${n <= value ? "fill-current" : ""}`} />
        ),
      )}
    </div>
  );
}

// After the last milestone settles, the client rates the freelancer; the profile rating is the average.
export default function ReviewPanel({ job, onChange }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (job.review)
    return (
      <section className="card p-5">
        <h2 className="poster-title text-2xl">The review</h2>
        <div className="mt-2">
          <Stars value={job.review.rating} />
        </div>
        {job.review.comment && <p className="mt-3 font-serif text-lg italic">“{job.review.comment}”</p>}
        <p className="mt-2 font-mono text-xs text-muted">{job.client.name} on {job.freelancer?.name}</p>
      </section>
    );
  if (job.viewerRole !== "client" || job.status !== "completed" || !job.freelancer) return null;

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setError("Pick a star rating first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/jobs/${job.id}/review`, { method: "POST", body: { rating, comment } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 !border-gold/50 p-5">
      <h2 className="poster-title text-2xl">Review {job.freelancer.name.split(" ")[0]}</h2>
      <p className="text-sm text-muted">The job is complete. Your rating goes on their profile and helps the next client decide.</p>
      <Stars value={rating} onPick={setRating} />
      <Field label="A few words (optional)" htmlFor="review-comment">
        <textarea id="review-comment" maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className="input" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" loading={busy} className="w-full">
        Post review
      </Button>
    </form>
  );
}
