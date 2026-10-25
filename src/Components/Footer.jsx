import { Link } from "react-router-dom";
import { Icon } from "./ui";

export default function Footer() {
  return (
    <footer className="mt-24 bg-ink text-white/80">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold text-white">
            <Icon name="shield" /> Blockchain
          </p>
          <p className="mt-3 max-w-xs text-sm">Hire developers worldwide and pay in USDC. Funds stay in escrow until the work is approved.</p>
        </div>
        <nav aria-label="Platform" className="text-sm">
          <p className="mb-3 font-semibold text-white">Platform</p>
          <ul className="space-y-2">
            <li><Link className="hover:text-white" to="/developers">Find developers</Link></li>
            <li><Link className="hover:text-white" to="/jobs">Browse jobs</Link></li>
            <li><Link className="hover:text-white" to="/jobs/new">Post a job</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="mb-3 font-semibold text-white">Fees</p>
          <p>2% platform fee, taken only when a milestone is released. No fee to post a job or apply.</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/60">Payments in USDC on Ethereum.</div>
    </footer>
  );
}
