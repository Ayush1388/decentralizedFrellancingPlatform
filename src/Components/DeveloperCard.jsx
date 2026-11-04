import { Link } from "react-router-dom";
import { imageUrl } from "../lib/api";
import { plural } from "../lib/format";
import { Icon } from "./ui";
import { DemoStamp, ReelTag, Spec } from "./cinema";

// A tilted gold one-sheet with the headshot and the name in poster type, like a job's poster.
function CastPoster({ dev, tilt }) {
  const photo = imageUrl(dev.image) || `/profile${(Math.abs(Number(dev.id) || 0) % 2) + 1}.svg`;
  return (
    <div
      className="relative flex aspect-[3/4] w-full max-w-[13rem] shrink-0 flex-col self-start overflow-hidden border-[3px] border-poster bg-gold p-3 text-poster shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <p className="text-[0.45rem] font-semibold uppercase tracking-[0.14em]">The Blockchain Picture Company presents</p>
      <img
        src={photo}
        alt=""
        loading="lazy"
        className="mt-2 aspect-[5/4] w-full border-2 border-poster bg-ticket object-cover"
        style={{ objectPosition: "50% 18%" }}
      />
      <p className="poster-title mt-2 line-clamp-2 text-[1.2rem] leading-[0.95]">{dev.name}</p>
      <p className="mt-auto truncate font-serif text-[0.7rem] italic">{dev.title}</p>
      {dev.demo && <DemoStamp className="absolute right-2 top-1/2 bg-ticket/80" />}
    </div>
  );
}

// A cast card, laid out like a programme entry for a job: poster on the left, billing on the right.
export default function DeveloperCard({ dev, onEdit, isMine, n }) {
  if (!dev) return null;
  const visible = dev.skills.slice(0, 3);
  const extra = dev.skills.length - visible.length;
  const number = n ?? dev.id;

  return (
    <article className="relative flex h-full flex-col gap-6 border border-white/10 bg-surface p-4 transition-colors hover:border-gold/40 sm:flex-row sm:p-5">
      <CastPoster dev={dev} tilt={number % 2 ? -2 : 2} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ReelTag n={number} demo={dev.demo} label="Cast" />
        <h3 className="poster-title mt-3 text-4xl text-ink">
          <Link to={`/developers/${dev.id}`} className="hover:text-gold">
            {dev.name}
          </Link>
        </h3>
        <p className="mt-2 font-serif text-lg italic text-gold">{dev.title}</p>
        {dev.bio && <p className="mt-3 line-clamp-3 text-[0.95rem] leading-relaxed text-ink-soft">{dev.bio}</p>}

        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Spec label="Rate">${dev.hourlyRate}/hr</Spec>
          <Spec label="Credits">{dev.jobsDone ? plural(dev.jobsDone, "job") : "Debut"}</Spec>
          <Spec label="Rating">
            {dev.rating > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={13} className="fill-gold text-gold" /> {dev.rating.toFixed(1)}
                {dev.ratingCount > 0 && <span className="text-muted">({dev.ratingCount})</span>}
              </span>
            ) : (
              "No reviews yet"
            )}
          </Spec>
          <Spec label="Known for">{visible.join(", ") || "Open casting"}{extra > 0 && ` +${extra}`}</Spec>
        </dl>

        <div className="mt-auto pt-6">
          {isMine ? (
            <button
              type="button"
              onClick={() => onEdit?.(dev)}
              className="inline-flex min-h-11 items-center gap-2 border border-[#3a3733] px-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em] hover:border-gold hover:text-gold"
            >
              Edit my billing
            </button>
          ) : (
            <Link
              to="/jobs/new"
              className="inline-flex min-h-11 items-center gap-2 bg-gold px-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-poster hover:brightness-110"
            >
              Cast {dev.name.split(" ")[0]} <Icon name="arrow" size={14} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
