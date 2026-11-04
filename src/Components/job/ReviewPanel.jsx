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

function ReviewForm({ job, who, onChange }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!rating) return setError("Pick a star rating first.");
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
      <h2 className="text-lg font-semibold">Review {who}</h2>
      <p className="text-sm text-muted">The job is complete. Your rating goes on their profile and helps the next person decide.</p>
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

// A review someone left, with the reply box for the person it is about.
function ReviewCard({ job, review, canReply, onChange }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const about = review.kind === "client_to_freelancer" ? job.freelancer?.name : job.client.name;

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/jobs/${job.id}/review/reply`, { method: "POST", body: { reply } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
      <p className="tabular-nums text-xs text-muted">
        {review.reviewer.name} on {about}
      </p>
      <Stars value={review.rating} />
      {review.comment && <p className="text-lg leading-relaxed">“{review.comment}”</p>}
      {review.reply && (
        <p className="border-l-2 border-gold/50 pl-3 text-sm text-ink-soft">
          <span className="stat-label block">Reply from {about}</span>
          {review.reply}
        </p>
      )}
      {canReply && !review.reply && (
        <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`reply-${review.kind}`} className="sr-only">
            Reply to this review
          </label>
          <input id={`reply-${review.kind}`} className="input" maxLength={500} required placeholder="Reply publicly" value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button type="submit" size="sm" loading={busy} variant="secondary">
            Reply
          </Button>
        </form>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

// After the last milestone is paid, each side rates the other once and the person reviewed may answer once.
export default function ReviewPanel({ job, user, onChange }) {
  const role = job.viewerRole;
  const reviews = job.reviews || [];
  const mine = reviews.find((r) => (role === "client" ? r.kind === "client_to_freelancer" : r.kind === "freelancer_to_client"));
  const participant = role === "client" || role === "freelancer";
  const canReviewNow = participant && job.status === "completed" && !!job.freelancer && !mine && job.milestones.some((m) => m.status === "released" || (m.status === "resolved" && (m.freelancerBps || 0) > 0));

  if (!reviews.length && !canReviewNow) return null;
  return (
    <div className="space-y-5">
      {reviews.length > 0 && (
        <section className="card space-y-4 p-5" aria-label="Reviews">
          <h2 className="text-lg font-semibold">The reviews</h2>
          {reviews.map((r) => {
            const aboutMe = r.kind === "client_to_freelancer" ? role === "freelancer" : role === "client";
            return <ReviewCard key={r.kind} job={job} review={r} canReply={aboutMe && !!user} onChange={onChange} />;
          })}
        </section>
      )}
      {canReviewNow && <ReviewForm job={job} who={role === "client" ? job.freelancer.name.split(" ")[0] : job.client.name.split(" ")[0]} onChange={onChange} />}
    </div>
  );
}
