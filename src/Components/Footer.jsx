import { Link } from "react-router-dom";

// Closing credits.
const credits = [
  ["Programme", "/jobs", "Browse open jobs"],
  ["The cast", "/developers", "Find developers"],
  ["Casting call", "/jobs/new", "Post a job"],
  ["Box office", "/wallet", "Wallet and withdrawals"],
];

export default function Footer() {
  return (
    <footer className="mt-32 border-t border-white/5 bg-[#070707] pb-10 pt-16 text-center">
      <p className="poster-title text-6xl text-gold sm:text-7xl">The end</p>
      <p className="mt-3 font-serif text-lg italic text-ink-soft">Hire developers worldwide and pay in USDC, held in escrow until the work is approved.</p>

      <dl className="mx-auto mt-12 grid max-w-md gap-3 px-5 font-mono text-[0.85rem]">
        {credits.map(([role, to, name]) => (
          <div key={role} className="grid grid-cols-2 gap-6">
            <dt className="text-right text-muted">{role}</dt>
            <dd className="text-left">
              <Link to={to} className="text-ink hover:text-gold">
                {name}
              </Link>
            </dd>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-6">
          <dt className="text-right text-muted">Concessions</dt>
          <dd className="text-left text-ink">2% fee, only on release</dd>
        </div>
      </dl>

      <p className="eyebrow mt-14 text-muted">The Blockchain Picture House · Payments in USDC on Ethereum</p>
    </footer>
  );
}
