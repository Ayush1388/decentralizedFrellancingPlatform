import { Link } from "react-router-dom";
import { Icon } from "./ui";

export default function Footer() {
  return (
    <footer className="mt-32 bg-green-950 text-white/70">
      <div className="container-page grid gap-12 py-16 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-3 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-white/60">
              <Icon name="shield" size={16} />
            </span>
            <span className="eyebrow !text-[0.78rem] !tracking-[0.24em]">Blockchain</span>
          </p>
          <p className="mt-6 max-w-sm font-serif text-3xl leading-tight text-white">Pay for work the moment it is approved, not before.</p>
        </div>
        <nav aria-label="Platform" className="text-sm">
          <p className="eyebrow mb-5 text-white/50">Platform</p>
          <ul className="space-y-3">
            <li><Link className="hover:text-white" to="/developers">Find developers</Link></li>
            <li><Link className="hover:text-white" to="/jobs">Browse jobs</Link></li>
            <li><Link className="hover:text-white" to="/jobs/new">Post a job</Link></li>
            <li><Link className="hover:text-white" to="/wallet">Wallet</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="eyebrow mb-5 text-white/50">Fees</p>
          <p>2% platform fee, taken only when a milestone is released. No fee to post a job or apply.</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-6 text-center">
        <p className="eyebrow !text-[0.65rem] text-white/50">Payments in USDC on Ethereum</p>
      </div>
    </footer>
  );
}
