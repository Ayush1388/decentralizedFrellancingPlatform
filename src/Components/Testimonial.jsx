import { Avatar, Icon } from "./ui";

const tints = ["bg-white", "bg-butter", "bg-sky", "bg-blush", "bg-white", "bg-mint"];

export default function Testimonial({ name, role, quote, seed = 0 }) {
  return (
    <figure className={`tile flex h-full flex-col ${tints[seed % tints.length]}`}>
      <div className="flex gap-0.5 text-ink" role="img" aria-label="5 out of 5 stars">
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={15} className="fill-current" />
        ))}
      </div>
      <blockquote className="mt-4 flex-1 text-[0.98rem] text-ink-soft">“{quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 rounded-full bg-white/60 p-1.5 pr-4">
        <Avatar seed={seed} size={40} />
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted">{role}</p>
        </div>
      </figcaption>
    </figure>
  );
}
