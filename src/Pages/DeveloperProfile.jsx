import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { timeAgo } from "../lib/format";
import { Badge, Button, CardSkeleton, EmptyState, Icon, SkillChip } from "../Components/ui";
import { Headshot } from "../Components/DeveloperCard";
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
        <EmptyState as="h1" icon="user" title="Profile not found" action={<Button to="/developers">Back to developers</Button>}>
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
      <Link to="/developers" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <Icon name="arrow" size={14} className="rotate-180" /> All developers
      </Link>

      <header className="mt-5 flex flex-col gap-7 sm:flex-row">
        <Headshot dev={dev} tilt={-2} className="sm:w-44" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {dev.jobsDone > 0 && <Badge tone="green">{dev.jobsDone} jobs completed</Badge>}
          </div>
          <h1 className="poster-title mt-3 text-5xl text-ink sm:text-6xl">{dev.name}</h1>
          <p className="mt-2 text-xl text-ink-soft">{dev.title}</p>
          {dev.ratingCount > 0 ? (
            <dl className="mt-6 grid max-w-md grid-cols-2 gap-6 border-t border-line pt-5">
              <div>
                <dt className="stat-label">Rating</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-xl font-semibold tabular-nums">
                  <Icon name="star" size={16} className="fill-gold text-gold" />
                  {dev.rating.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt className="stat-label">Reviews</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{dev.ratingCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-muted">New here: no reviews yet.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
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

      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_16rem]">
        <div className="space-y-8">
          {dev.bio && (
            <section>
              <h2 className="text-[1.375rem] font-semibold">About</h2>
              <p className="mt-2 max-w-[68ch] whitespace-pre-wrap leading-relaxed text-ink-soft">{dev.bio}</p>
            </section>
          )}
          <section aria-label="Reviews">
            <h2 className="text-[1.375rem] font-semibold">Reviews</h2>
            {!dev.reviews?.length ? (
              <p className="mt-2 text-sm text-muted">No reviews yet. Reviews appear after a client has paid for finished work.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {dev.reviews.map((r, i) => (
                  <li key={i} className="card space-y-2 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars value={r.rating} />
                      <span className="text-sm text-muted">
                        {r.reviewer} on “{r.jobTitle}”, {timeAgo(r.createdAt)}
                      </span>
                    </div>
                    {r.comment && <p className="text-lg leading-relaxed">“{r.comment}”</p>}
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
              <h2 className="text-lg font-semibold">Skills</h2>
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
