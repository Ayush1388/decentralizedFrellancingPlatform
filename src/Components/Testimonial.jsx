import { Avatar, Badge, Icon } from "./ui";

// A review: the real rating, the words as written, and who wrote them about which job.
export default function Testimonial({ name, role, jobTitle, quote, rating = 5, demo, seed = 0 }) {
  return (
    <figure className="card flex h-full min-w-0 flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-0.5 text-gold" role="img" aria-label={`${rating} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Icon key={i} name="star" size={16} className={i < rating ? "fill-current" : "opacity-25"} />
          ))}
        </div>
        {demo && <Badge tone="red">Demo</Badge>}
      </div>
      <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-ink">“{quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <Avatar seed={seed} size={40} />
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          <p className="truncate text-sm text-muted">
            {role}
            {jobTitle && ` on “${jobTitle}”`}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
