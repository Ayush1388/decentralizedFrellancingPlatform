import { Link } from "react-router-dom";
import { m } from "motion/react";
import { imageUrl } from "../lib/api";
import { useLift } from "../lib/useLift";
import { Button, Icon, SkillChip } from "./ui";
import { DemoStamp, Hang, LitWall, Spec } from "./cinema";

// A headshot printed on ticket stock, with the hourly rate set in poster type along the foot.
// Its type is sized from its own width, so the rate prints the same in a big profile and a small card.
export function Headshot({ dev, tilt = 0, className = "" }) {
  const photo = imageUrl(dev.image) || `/profile${(Math.abs(Number(dev.id) || 0) % 2) + 1}.svg`;
  return (
    <div
      className={`@container relative w-full max-w-[11rem] shrink-0 self-start border-[3px] border-poster bg-ticket p-2 pb-1 text-poster shadow-[0_18px_36px_-14px_rgb(0_0_0/0.85)] sm:w-40 ${className}`}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <img src={photo} alt="" loading="lazy" className="aspect-[4/5] w-full bg-[#e6dcc4] object-cover" style={{ objectPosition: "50% 18%" }} />
      <p className="poster-title py-[4cqw] text-center text-[13cqw]">
        <span className="sr-only">Rate: </span>${dev.hourlyRate}/hr
      </p>
      {dev.demo && <DemoStamp className="absolute right-[7%] top-[52%] bg-ticket/85 !text-[9cqw]" />}
    </div>
  );
}

// A developer on the lobby wall: the lit headshot, then name, speciality, rating and experience. Four fit across.
export function CastCard({ dev, n = 1, isMine, onEdit }) {
  const lift = useLift();
  return (
    <m.article {...lift} className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors duration-300 hover:border-[#4a3d38]">
      <LitWall tilt={n % 2 ? -3 : 3}>
        <Headshot dev={dev} className="!max-w-none sm:!w-full" />
      </LitWall>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
        <h3 className="truncate font-semibold text-ink sm:text-lg">
          <Link to={`/developers/${dev.id}`} className="hover:text-gold">
            {dev.name}
          </Link>
        </h3>
        <p className="line-clamp-1 text-sm text-ink-soft">{dev.title}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {dev.rating > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium tabular-nums">
              <Icon name="star" size={14} className="fill-gold text-gold" />
              {dev.rating.toFixed(1)}
              {dev.ratingCount > 0 && <span className="font-normal text-muted">({dev.ratingCount})</span>}
            </span>
          ) : (
            <span className="text-muted">No reviews yet</span>
          )}
          <span className="tabular-nums text-muted">{dev.jobsDone ? `${dev.jobsDone} jobs done` : "New here"}</span>
        </p>
        <div className="mt-auto pt-4">
          {isMine ? (
            <Button variant="secondary" size="sm" className="!min-h-10 w-full" onClick={() => onEdit?.(dev)}>
              Edit my profile
            </Button>
          ) : (
            <Button to={`/developers/${dev.id}`} size="sm" className="!min-h-10 w-full">
              View profile
            </Button>
          )}
        </div>
      </div>
    </m.article>
  );
}

export default function DeveloperCard({ dev, onEdit, isMine, n }) {
  const lift = useLift();
  if (!dev) return null;
  const visible = dev.skills.slice(0, 4);
  const extra = dev.skills.length - visible.length;
  const tilt = (n ?? dev.id) % 2 ? -2 : 2;

  return (
    <m.article {...lift} className="relative flex h-full flex-col gap-6 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:p-6">
      <Hang tilt={tilt} className="w-full max-w-[11rem] self-start sm:w-40">
        <Headshot dev={dev} className="!max-w-none sm:!w-full" />
      </Hang>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <h3 className="text-2xl font-semibold leading-snug text-ink">
            <Link to={`/developers/${dev.id}`} className="hover:text-gold">
              {dev.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-ink-soft">{dev.title}</p>
        </div>
        {dev.bio && <p className="line-clamp-2 text-ink-soft">{dev.bio}</p>}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Spec label="Rating">
            {dev.rating > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={14} className="fill-gold text-gold" /> {dev.rating.toFixed(1)}
                {dev.ratingCount > 0 && <span className="font-normal text-muted">({dev.ratingCount})</span>}
              </span>
            ) : (
              "No reviews yet"
            )}
          </Spec>
          <Spec label="Jobs done">{dev.jobsDone || "New here"}</Spec>
        </dl>

        {visible.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((s) => (
              <SkillChip key={s}>{s}</SkillChip>
            ))}
            {extra > 0 && <SkillChip>+{extra} more</SkillChip>}
          </div>
        )}

        <div className="mt-auto flex items-center gap-3 pt-1">
          {isMine ? (
            <Button variant="secondary" size="sm" className="!min-h-10 !px-4" onClick={() => onEdit?.(dev)}>
              Edit my profile
            </Button>
          ) : (
            <Button to={`/developers/${dev.id}`} size="sm" className="!min-h-10 !px-4">
              View profile
            </Button>
          )}
        </div>
      </div>
    </m.article>
  );
}
