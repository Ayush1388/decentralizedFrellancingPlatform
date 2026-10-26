# Blockchain Freelance

Hire developers and pay in USDC. Each job is split into milestones; the client funds a milestone into escrow,
the freelancer delivers, and the client approves it to release payment.

**Live demo: https://decentralized-frellancing-platform.vercel.app**

- API: https://freelance-api-7v0a.onrender.com (free tier: the first request after a quiet spell takes up to a minute)
- Demo login: `demo@blockchainfreelance.dev` / `demo1234`, or click **Watch as the demo client** on the site.
  Jobs and developers stamped **DEMO** are sample data.
- The live site runs in preview mode: milestones are tracked by the API and no real USDC moves.
  See [Sepolia](#sepolia) to connect the escrow contract.

![Home: the ticket hero and film strip](docs/screenshots/home.jpg)

| | |
|---|---|
| ![Open jobs listed as reels](docs/screenshots/jobs.jpg) | ![Developer profiles](docs/screenshots/developers.jpg) |
| **Jobs:** budget, openings, applicants, closing date, duration and level | **Developers:** rate, completed jobs and rating from client reviews |
| ![Reviewing applicants](docs/screenshots/applicants.jpg) | ![Client dashboard](docs/screenshots/dashboard.jpg) |
| **Applicants:** quote vs budget, delivery estimate, GitHub, portfolio, resume, shortlist and pre-hire chat | **Dashboard:** money by milestone state, payments, what needs your action, conversations |

![A contract in progress](docs/screenshots/job.jpg)

## What it does

- **Post a job:** milestones with USDC amounts, number of openings, how long applications stay open, expected duration and experience level.
  With several openings, each hire gets their own contract with its own copy of the milestones.
- **Apply:** a cover note, a price quote, a delivery estimate, and at least one of a PDF resume, a GitHub link or a portfolio link.
  Applicants can withdraw while the client is still deciding.
- **Hire:** the client shortlists, declines and messages applicants before hiring, then confirms the hire.
- **Work:** the client funds each milestone, the freelancer delivers a link with a note, and the client approves it or requests changes.
  Either side can open a dispute with a reason; the arbiter rules on a split.
- **Get paid:** approval releases the milestone (2% fee from the freelancer's share). A silent client lets the freelancer claim after 7 days;
  no delivery lets the client reclaim after 14.
- **Afterwards:** the client reviews the freelancer and the profile rating becomes the average of their reviews.
- Every job has an activity log and a "next step" hint. Deliverables are visible only to the two parties and the arbiter.
  Resumes open only for the applicant and the client they applied to.

## Stack

- `src/` React 19 + Vite + Tailwind 4 frontend, wagmi/viem for the Ethereum wallet
- `server/` Go API (stdlib `net/http`, PostgreSQL via pgx): auth (email, Google, Sign-In with Ethereum), developers, jobs,
  applications, milestones, chat, reviews. Uploaded files are stored in Postgres.
- `contracts/` Solidity escrow (`JobEscrow.sol`) with Hardhat tests
- `docker-compose.yml` a dedicated Postgres 17 on port 5434 (so it never clashes with other local databases)
- `backend/` the previous Express/Mongo API, kept for reference

Deployed with the frontend on Vercel, the API on Render (`server/Dockerfile`) and the database on Neon.
Set `SEED_DEMO=true` on the API to add the labelled demo data and the public demo login.

## Run it

Needs Node 20+, Go 1.22+ and Docker.

```sh
npm install
npm run dev          # Postgres + Go API (:3001) + Vite (:5173), milestones tracked off-chain (preview mode)
```

Then open http://localhost:5173. Docker Desktop must be running; `npm run dev` checks for Docker and Go and tells
you what is missing. Leave that terminal open (Ctrl+C stops everything). If the page says it cannot reach the API,
the dev command is not running.

### With a real (local) blockchain

```sh
npm run contracts:install   # once
npm run dev:chain           # Postgres, Hardhat node (:8545), deploys MockUSDC + JobEscrow, API wired to it, Vite
```

Add the network to MetaMask (RPC `http://127.0.0.1:8545`, chain ID `31337`) and import a Hardhat test account
(the private keys are printed by the `chain` process). On the Wallet page, "Get 10,000 test USDC" mints mock USDC.

Money flow when the API is in on-chain mode: the wallet sends the transaction, then the API reads the receipt,
checks the event matches that exact milestone, and only then updates its database. The contract enforces who may
act and when; the API never trusts the browser about money.

### Sepolia

```sh
cd contracts && cp .env.example .env     # SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY (test key only)
npm run deploy:sepolia                   # uses Circle's Sepolia USDC; prints the three values for server/.env
```

### Tests

```sh
npm run contracts:test                   # 23 contract tests, including a randomised conservation check
cd server && go test ./...               # API + chain verification (needs `npm run db`)
node scripts/e2e.mjs                     # real chain + real contract + real API + Postgres, whole money path
```

Copy `server/.env.example` to `server/.env` to set `JWT_SECRET`, Google keys and `ADMIN_EMAILS`.

## Contract rules (`contracts/contracts/JobEscrow.sol`)

- A client opens an escrow with a list of milestones and funds each one (USDC) before work starts.
- Freelancer submits (a hash of the deliverable link); client approves to release.
- Payouts are credited and pulled with `withdraw()`. The 2% fee comes out of the freelancer's share only.
- Client silent for 7 days after a submission: the freelancer can `claim`. No submission for 14 days: the client can `refund`.
- Either side can `dispute`; the arbiter can only split that milestone between the two parties.
- `pause()` stops new money coming in. It never blocks withdrawals or exits.

Not audited. Get a professional review before putting real funds through it.
