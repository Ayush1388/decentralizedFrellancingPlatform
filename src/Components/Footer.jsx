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

      <dl className="mx-auto mt-12 grid max-w-md gap-3 px-5 font-typewriter text-[0.85rem]">
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

      <nav aria-label="Legal and help" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 font-typewriter text-xs text-muted">
        <Link to="/help" className="hover:text-gold">Help</Link>
        <Link to="/terms" className="hover:text-gold">Terms</Link>
        <Link to="/privacy" className="hover:text-gold">Privacy</Link>
        <a href="https://github.com/Ayush1388/decentralizedFrellancingPlatform" target="_blank" rel="noopener noreferrer" className="hover:text-gold">Source</a>
      </nav>
      <p className="mt-6 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">The Blockchain Picture House · Payments in USDC on Ethereum</p>
    </footer>
  );
}
