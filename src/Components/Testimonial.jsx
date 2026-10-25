import { Avatar, Icon } from "./ui";

export default function Testimonial({ name, role, quote, seed = 0 }) {
  return (
    <figure className="card flex h-full flex-col p-6">
      <div className="flex gap-0.5 text-green-700" role="img" aria-label="5 out of 5 stars">
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={14} className="fill-current" />
        ))}
      </div>
      <blockquote className="mt-5 flex-1 font-serif text-[1.35rem] leading-snug text-ink">“{quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <Avatar seed={seed} size={40} />
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted">{role}</p>
        </div>
      </figcaption>
    </figure>
  );
}
