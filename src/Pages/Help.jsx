import { Link } from "react-router-dom";
import { PageHeader } from "../Components/ui";

const groups = [
  {
    title: "Getting started",
    items: [
      ["Do I need a crypto wallet?", "Only to move money. You can browse, apply and talk to people with just an email account. To be hired, to fund a milestone or to withdraw a payment you need a wallet (MetaMask, Coinbase Wallet, or any phone wallet through WalletConnect). Link it once from the Box office page by signing a free message."],
      ["What is USDC?", "A digital dollar: one USDC is meant to stay worth one US dollar, so a $500 milestone is $500 whatever the crypto market does."],
      ["What are network fees (gas)?", "Every transaction on the blockchain costs a small fee paid in ETH. On the test network it is free test ETH, and the site checks your balance before sending anything. Real networks charge real (usually small) fees."],
      ["What is the test network?", "Right now money on this site is test money: Sepolia ETH and test USDC. Get free test ETH from a Sepolia faucet and free test USDC from faucet.circle.com. Nothing you do here has real financial value."],
    ],
  },
  {
    title: "Clients",
    items: [
      ["How does paying work?", "You split the job into milestones. Before work starts you fund a milestone: the USDC moves into an escrow contract, not to the freelancer. When you approve the delivery it is released to them. If something is wrong you can ask for changes (up to 3 times per milestone) or open a dispute."],
      ["What if the freelancer disappears?", "If a funded milestone gets no delivery for 14 days, you can reclaim the money from the job page."],
      ["Can I change the price after hiring?", "Yes, before anything is funded: edit the milestones on the contract. If an applicant quoted less than your budget, you can hire at their quote instead. After funding, add a follow-up contract for new work or a bonus."],
      ["Can I hire more than one person?", "Set several openings when you post. Each person you hire gets their own contract with its own milestones, escrow and chat."],
    ],
  },
  {
    title: "Freelancers",
    items: [
      ["How do I get paid?", "When the client approves a milestone, your payment (minus the 2% fee) is credited to your wallet balance in the escrow. Open the Box office and press Withdraw to move it to your wallet."],
      ["What if the client never responds?", "After you deliver, the client has 7 days to review. If they stay silent you can claim the payment yourself."],
      ["What makes a good application?", "A clear cover note, a realistic quote and delivery time, and proof of your work: a resume, your GitHub or a portfolio link. Reply quickly if the client messages you."],
      ["Why can’t I be hired?", "On-chain contracts need your wallet. Link it in the Box office, then tell the client."],
    ],
  },
  {
    title: "Disputes",
    items: [
      ["How does a dispute work?", "Either side opens one with a reason. The money is frozen and the platform arbiter reads the reason, the chat (including attachments) and the activity log, then splits the milestone. If the arbiter does not rule within 30 days, either side can settle it 50/50."],
      ["How do I make my case?", "Keep everything in the job chat: briefs, files and decisions. The arbiter can read it, and only it, while a dispute is open."],
    ],
  },
  {
    title: "Fees, money and safety",
    items: [
      ["What are the fees?", "The platform takes 2% of what the freelancer receives, only when a milestone is released. Posting and applying are free. The client pays exactly the milestone price."],
      ["Can I cash out USDC to my bank?", "The site pays out in USDC to your wallet. To turn it into local currency, send it to an exchange or service that supports your country, and check their fees and rules first. We do not provide that service."],
      ["Is it safe?", "The escrow contract has had a careful review by its author but not a professional audit, so use it with test money only for now. Never share your wallet seed phrase with anyone, including us: we will never ask for it."],
      ["Something looks wrong with a job or a person.", "Use the Report button on the job page. The platform team reviews reports."],
    ],
  },
];

export default function Help() {
  return (
    <div className="container-page max-w-3xl pb-20">
      <PageHeader eyebrow="The programme notes" title="Help" subtitle="Plain answers to the questions people ask first." />
      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`h-${g.title}`}>
            <h2 id={`h-${g.title}`} className="poster-title text-3xl text-gold">
              {g.title}
            </h2>
            <div className="mt-3 divide-y divide-white/10 border border-white/10">
              {g.items.map(([q, a]) => (
                <details key={q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {q}
                    <span aria-hidden="true" className="text-gold transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-muted">
        Still stuck? Read the{" "}
        <Link to="/terms" className="text-gold underline-offset-2 hover:underline">
          terms
        </Link>
        , or open an issue on GitHub.
      </p>
    </div>
  );
}
