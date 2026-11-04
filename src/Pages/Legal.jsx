import { Link } from "react-router-dom";
import { PageHeader } from "../Components/ui";

const UPDATED = "4 November 2026";
const ISSUES = "https://github.com/Ayush1388/decentralizedFrellancingPlatform/issues";

function Doc({ title, children }) {
  return (
    <div className="container-page max-w-3xl pb-20">
      <PageHeader title={title} subtitle={`Last updated ${UPDATED}`} />
      <div className="doc space-y-8 text-ink-soft">
        {children}
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <Doc title="Terms of use">
      <section>
        <h2>What this is</h2>
        <p>
          Blockchain Picture House is a marketplace where clients post jobs and freelancers apply. Payment for each job is split into milestones and held in an escrow smart
          contract until the client approves the work. The site connects the two sides and keeps the records; it does not do the work and is not a party to the agreement between
          client and freelancer.
        </p>
        <p>
          <strong>This is a test deployment.</strong> It runs on a test network with test money (Sepolia and test USDC), or in a preview mode that moves no money at all. Do not send
          real funds to it. Features, data and the contract can change or be reset without notice.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be old enough to enter a contract where you live, and give true information.</li>
          <li>You are responsible for your password and your wallet keys. We cannot recover a lost wallet or reverse a blockchain transaction.</li>
          <li>One person, one account. Do not create accounts to mislead others or to get around a suspension.</li>
        </ul>
      </section>

      <section>
        <h2>Jobs, work and payment</h2>
        <ul>
          <li>Clients describe the work and its milestones honestly. Freelancers apply only for work they can do.</li>
          <li>A milestone is funded into escrow before work starts. When the client approves it, the payment is released to the freelancer, less the platform fee shown on the site.</li>
          <li>If the client does not respond after delivery, the freelancer may claim the payment after the review window. If nothing is delivered, the client may reclaim the funds after the delivery window. The windows are shown on every job.</li>
          <li>Either side can open a dispute with a reason. The platform arbiter decides how a disputed milestone is split. If the arbiter has not ruled after 30 days, either side can settle it 50/50.</li>
          <li>Taxes on what you earn or pay are your responsibility.</li>
        </ul>
      </section>

      <section>
        <h2>What you may not do</h2>
        <ul>
          <li>Post or send anything illegal, fraudulent, harassing or misleading, or work that infringes someone else&apos;s rights.</li>
          <li>Take a deal off the platform to avoid the escrow after meeting someone here, or ask others to pay outside it.</li>
          <li>Upload malware, scrape the site, or try to break or overload it.</li>
          <li>Review dishonestly, or trade reviews.</li>
        </ul>
        <p>We can remove content, close postings and suspend accounts that break these rules. Contracts already running are never frozen by a suspension, so nobody&apos;s money is trapped.</p>
      </section>

      <section>
        <h2>The smart contract and its risks</h2>
        <p>
          The escrow contract has not been professionally audited. Smart contracts can contain bugs, and blockchain transactions cannot be undone. Use the real network only after an
          audit, and only with money you can afford to lose.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          The service is provided as it is, without promises that it will always be available or error-free. To the extent the law allows, we are not liable for lost work, lost
          funds, or indirect losses arising from using the site or the contract. Nothing here limits liability that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms; the date above shows the latest version, and continuing to use the site means you accept it. Questions, reports or a security concern:{" "}
          <a href={ISSUES} className="text-gold underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
            open an issue
          </a>
          . Also see the <Link to="/privacy" className="text-gold underline-offset-2 hover:underline">privacy policy</Link>.
        </p>
      </section>
    </Doc>
  );
}

export function Privacy() {
  return (
    <Doc title="Privacy policy">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account:</strong> your name, and your email and a hashed password if you sign up that way. For wallet sign-in, your wallet address. For Google sign-in, the
            account identifier and email Google shares.
          </li>
          <li>
            <strong>What you create:</strong> profiles, jobs, applications (including quotes, links and a resume PDF), messages and their attachments, reviews, saved jobs and
            reports you send.
          </li>
          <li>
            <strong>Blockchain data:</strong> wallet addresses and transactions on the escrow contract are public on the blockchain by design, and cannot be erased.
          </li>
          <li>
            <strong>Technical:</strong> request logs with the time, page and status, and the network address needed for rate limiting. We do not use advertising trackers.
          </li>
        </ul>
      </section>

      <section>
        <h2>Why, and who sees it</h2>
        <ul>
          <li>To run the marketplace: show your profile and jobs, let clients and freelancers talk, and keep the milestone records.</li>
          <li>Your resume is visible only to you and to clients of jobs you applied to. Messages and attachments are visible to the people in that conversation, and to the arbiter while a milestone is disputed.</li>
          <li>Deliverable links and delivery notes are visible to the client, the freelancer and the arbiter.</li>
          <li>Job briefs and their files are visible to signed-in users. Public profiles show your name, title, rate, skills and reviews.</li>
          <li>We send emails only for account confirmation, password reset and the notifications you can switch off in your settings.</li>
          <li>We do not sell your data.</li>
        </ul>
      </section>

      <section>
        <h2>Where it is kept, and for how long</h2>
        <p>
          Data is stored in a PostgreSQL database and files are stored inside that database. We keep it while your account exists. Backups from the database provider may hold older
          copies for a short time.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>Download</strong> everything we hold about you, and <strong>delete</strong> your account, from your <Link to="/settings" className="text-gold underline-offset-2 hover:underline">settings</Link>.
            Deleting removes your profile, resume files, saved jobs and email, and renames you “Deleted user” in other people&apos;s job history and chats.
          </li>
          <li>Switch email notifications off at any time.</li>
          <li>Ask us to correct or remove something by opening an issue.</li>
        </ul>
      </section>

      <section>
        <h2>Third parties</h2>
        <p>
          The site is hosted by Vercel (website) and Render (API) with a database on Neon. Wallet connections use your wallet provider, and if enabled, WalletConnect and Cloudflare
          Turnstile (a human check on sign-up). Their own policies apply to what they handle.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          <a href={ISSUES} className="text-gold underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
            Open an issue
          </a>{" "}
          for privacy questions. See also the <Link to="/terms" className="text-gold underline-offset-2 hover:underline">terms of use</Link>.
        </p>
      </section>
    </Doc>
  );
}
