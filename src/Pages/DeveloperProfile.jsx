import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo } from "../lib/format";
import { Avatar, Badge, Button, CardSkeleton, EmptyState, Icon, SkillChip } from "../Components/ui";
import ReportButton from "../Components/ReportButton";

function Stars({ value }) {
  return (
    <span className="inline-flex gap-0.5 text-gold" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={14} className={n <= Math.round(value) ? "fill-current" : ""} />
      ))}
    </span>
  );
}

// /developers/:id  The public page of one freelancer: who they are, what clients said, how to hire them.
export default function DeveloperProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [dev, setDev] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/developers/${id}`)
      .then(setDev)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div className="container-page pt-16">
        <EmptyState icon="user" title="Profile not found" action={<Button to="/developers">Back to the cast</Button>}>
          {error}
        </EmptyState>
      </div>
    );
  if (!dev)
    return (
      <div className="container-page max-w-4xl pt-12">
        <CardSkeleton className="h-96" />
      </div>
    );

  const mine = user?.id === dev.userId;
  return (
    <div className="container-page max-w-4xl pb-16 pt-8">
      <Link to="/developers" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-gold">
        <Icon name="arrow" size={14} className="rotate-180" /> The cast
      </Link>

      <header className="mt-4 flex flex-col gap-6 border border-gold/30 bg-surface p-6 sm:flex-row">
        <div className="shrink-0 self-start border-[3px] border-poster bg-gold p-1.5">
          <Avatar src={dev.image} seed={dev.id} size={120} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {dev.demo && <Badge tone="red">Demo data</Badge>}
            {dev.jobsDone > 0 && <Badge tone="green">{dev.jobsDone} jobs completed</Badge>}
          </div>
          <h1 className="poster-title mt-3 text-5xl text-gold sm:text-6xl">{dev.name}</h1>
          <p className="mt-2 font-serif text-xl italic text-ink-soft">{dev.title}</p>
          <dl className="mt-5 grid max-w-md grid-cols-3 gap-px border border-white/10 bg-white/10">
            <div className="bg-[#0f0e0d] px-4 py-3">
              <dt className="stat-label">Rate</dt>
              <dd className="font-mono font-bold">${dev.hourlyRate}/hr</dd>
            </div>
            <div className="bg-[#0f0e0d] px-4 py-3">
              <dt className="stat-label">Rating</dt>
              <dd className="font-mono font-bold">{dev.ratingCount > 0 ? `★ ${dev.rating.toFixed(1)}` : "—"}</dd>
            </div>
            <div className="bg-[#0f0e0d] px-4 py-3">
              <dt className="stat-label">Reviews</dt>
              <dd className="font-mono font-bold">{dev.ratingCount}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {mine ? (
              <Button to="/developers" variant="secondary" size="sm">
                Edit my profile
              </Button>
            ) : (
              <Button to="/jobs/new">Hire {dev.name.split(" ")[0]}</Button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_16rem]">
        <div className="space-y-8">
          {dev.bio && (
            <section>
              <h2 className="poster-title text-3xl text-gold">The bio</h2>
              <p className="mt-2 whitespace-pre-wrap text-ink-soft">{dev.bio}</p>
            </section>
          )}
          <section aria-label="Reviews">
            <h2 className="poster-title text-3xl text-gold">The reviews</h2>
            {!dev.reviews?.length ? (
              <p className="mt-2 text-sm text-muted">No reviews yet. Reviews appear after a client has paid for finished work.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {dev.reviews.map((r, i) => (
                  <li key={i} className="card space-y-2 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars value={r.rating} />
                      <span className="font-mono text-xs text-muted">
                        {r.reviewer} on “{r.jobTitle}” · {timeAgo(r.createdAt)}
                      </span>
                    </div>
                    {r.comment && <p className="font-serif text-lg italic">“{r.comment}”</p>}
                    {r.reply && (
                      <p className="border-l-2 border-gold/50 pl-3 text-sm text-ink-soft">
                        <span className="stat-label block">Reply from {dev.name.split(" ")[0]}</span>
                        {r.reply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          {dev.skills?.length > 0 && (
            <section className="card p-5">
              <h2 className="poster-title text-2xl">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {dev.skills.map((s) => (
                  <SkillChip key={s}>{s}</SkillChip>
                ))}
              </div>
            </section>
          )}
          {!mine && user && <ReportButton kind="user" targetId={dev.userId} label="Report this profile" />}
        </aside>
      </div>
    </div>
  );
}
