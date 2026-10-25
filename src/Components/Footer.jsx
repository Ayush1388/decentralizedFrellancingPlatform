import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="container-page mt-28 pb-6">
      <div className="tile grid gap-10 bg-ink p-8 text-white/70 sm:grid-cols-[1.4fr_1fr_1fr] sm:p-10">
        <div>
          <p className="font-serif text-3xl text-white">Blockchain</p>
          <p className="mt-3 max-w-xs text-sm">Hire developers worldwide and pay in USDC. Funds stay in escrow until the work is approved.</p>
        </div>
        <nav aria-label="Platform" className="text-sm">
          <p className="mb-4 font-medium text-white">Platform</p>
          <ul className="space-y-2.5">
            <li><Link className="hover:text-white" to="/developers">Find developers</Link></li>
            <li><Link className="hover:text-white" to="/jobs">Browse jobs</Link></li>
            <li><Link className="hover:text-white" to="/jobs/new">Post a job</Link></li>
            <li><Link className="hover:text-white" to="/dashboard">Dashboard</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="mb-4 font-medium text-white">Fees</p>
          <p>2% platform fee, taken only when a milestone is released. No fee to post a job or apply.</p>
          <p className="mt-6 text-xs text-white/50">Payments in USDC on Ethereum.</p>
        </div>
      </div>
    </footer>
  );
}
