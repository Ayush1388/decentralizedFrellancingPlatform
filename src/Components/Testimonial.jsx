import { Avatar, Icon } from "./ui";

// A critic's notice: gold stars, the quote in italic serif, the byline in type.
export default function Testimonial({ name, role, quote, seed = 0 }) {
  return (
    <figure className="card flex h-full flex-col p-6">
      <div className="flex gap-1 text-gold" role="img" aria-label="5 out of 5 stars">
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={16} className="fill-current" />
        ))}
      </div>
      <blockquote className="mt-5 flex-1 font-serif text-[1.15rem] italic leading-snug text-ink">“{quote}”</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-dashed border-white/10 pt-4">
        <Avatar seed={seed} size={40} />
        <div>
          <p className="font-mono text-sm font-bold">{name}</p>
          <p className="text-xs text-muted">{role}</p>
        </div>
      </figcaption>
    </figure>
  );
}
