import { Avatar, Icon } from "./ui";
import { DemoStamp } from "./cinema";

// A critic's notice: gold stars for the real rating, the quote in italic serif, the byline in type.
export default function Testimonial({ name, role, jobTitle, quote, rating = 5, demo, seed = 0 }) {
  return (
    <figure className="card relative flex h-full flex-col p-6">
      {demo && <DemoStamp className="absolute right-4 top-4 !text-base" />}
      <div className="flex gap-1 text-gold" role="img" aria-label={`${rating} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={16} className={i < rating ? "fill-current" : "opacity-25"} />
        ))}
      </div>
      <blockquote className="mt-5 flex-1 font-serif text-[1.15rem] italic leading-snug text-ink">“{quote}”</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-dashed border-white/10 pt-4">
        <Avatar seed={seed} size={40} />
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">{name}</p>
          <p className="truncate text-xs text-muted">
            {role}
            {jobTitle && ` · on “${jobTitle}”`}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
