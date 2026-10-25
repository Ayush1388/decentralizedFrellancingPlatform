import { Avatar, Button, Icon, SkillChip } from "./ui";

export default function DeveloperCard({ dev, onEdit, isMine }) {
  if (!dev) return null;
  const visible = dev.skills.slice(0, 4);
  const extra = dev.skills.length - visible.length;

  return (
    <article className="card card-hover flex h-full flex-col p-5">
      <div className="flex items-center gap-3">
        <Avatar src={dev.image} seed={dev.id} size={52} />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold leading-tight">{dev.name}</h3>
          <p className="truncate text-sm text-muted">{dev.title}</p>
        </div>
      </div>

      <dl className="mt-4 flex items-center gap-4 text-sm">
        <div>
          <dt className="sr-only">Hourly rate</dt>
          <dd className="font-semibold">
            ${dev.hourlyRate}
            <span className="font-normal text-muted"> /hr</span>
          </dd>
        </div>
        <div>
          <dt className="sr-only">Jobs completed</dt>
          <dd className="text-muted">{dev.jobsDone ? `${dev.jobsDone} jobs` : "New"}</dd>
        </div>
        {dev.rating > 0 && (
          <div>
            <dt className="sr-only">Rating</dt>
            <dd className="flex items-center gap-1 text-muted">
              <Icon name="star" size={14} className="fill-amber-400 text-amber-500" /> {dev.rating.toFixed(1)}
            </dd>
          </div>
        )}
      </dl>

      {dev.bio && <p className="mt-3 line-clamp-3 text-sm text-muted">{dev.bio}</p>}

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
            Hire {dev.name.split(" ")[0]}
          </Button>
        )}
      </div>
    </article>
  );
}
