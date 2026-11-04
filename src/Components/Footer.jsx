import { Link } from "react-router-dom";

const links = [
  ["/jobs", "Jobs"],
  ["/developers", "Developers"],
  ["/jobs/new", "Post a job"],
  ["/wallet", "Wallet"],
  ["/help", "Help"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
];

// A short sign-off: the house name, the one rule that matters, and the ways out.
export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page flex flex-col gap-8 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="poster-title text-3xl text-ink">The end</p>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">Hire developers worldwide and pay in USDC, held in escrow until you approve the work. 2% fee, only on payouts.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 text-sm">
            {links.map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <a href="https://github.com/Ayush1388/decentralizedFrellancingPlatform" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">
                Source code
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
