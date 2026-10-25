import { Avatar, Button, Icon, SkillChip } from "./ui";
import { DemoStamp } from "./cinema";

// A cast card: headshot in a gold frame, name in poster type, billing in type.
export default function DeveloperCard({ dev, onEdit, isMine }) {
  if (!dev) return null;
  const visible = dev.skills.slice(0, 4);
  const extra = dev.skills.length - visible.length;

  return (
    <article className="card card-hover relative flex h-full flex-col p-5">
      {dev.demo && <DemoStamp className="absolute right-3 top-3 !text-base" />}
      <div className="flex items-start gap-4">
        <div className="shrink-0 border-[3px] border-poster bg-gold p-1">
          <Avatar src={dev.image} seed={dev.id} size={64} />
        </div>
        <div className="min-w-0 pr-12">
          <h3 className="poster-title truncate text-3xl">{dev.name}</h3>
          <p className="truncate font-serif italic text-gold">{dev.title}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-dashed border-white/10 py-3">
        <div>
          <dt className="stat-label">Rate</dt>
          <dd className="font-mono text-sm font-bold">${dev.hourlyRate}/hr</dd>
        </div>
        <div>
          <dt className="stat-label">Credits</dt>
          <dd className="font-mono text-sm">{dev.jobsDone ? `${dev.jobsDone} jobs` : "Debut"}</dd>
        </div>
        <div>
          <dt className="stat-label">Rating</dt>
          <dd className="flex items-center gap-1 font-mono text-sm">
            {dev.rating > 0 ? (
              <>
                <Icon name="star" size={13} className="fill-gold text-gold" /> {dev.rating.toFixed(1)}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {dev.bio && <p className="mt-4 line-clamp-3 text-sm text-ink-soft">{dev.bio}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visible.map((s) => (
          <SkillChip key={s}>{s}</SkillChip>
        ))}
        {extra > 0 && <SkillChip>+{extra}</SkillChip>}
      </div>

      <div className="mt-auto pt-5">
        {isMine ? (
          <Button variant="secondary" className="w-full" onClick={() => onEdit?.(dev)}>
            Edit my profile
          </Button>
        ) : (
          <Button to="/jobs/new" className="w-full">
            Cast {dev.name.split(" ")[0]}
          </Button>
        )}
      </div>
    </article>
  );
}
