# Blockchain Freelance

Hire developers and pay in USDC. Each job is split into milestones; the client funds a milestone, the freelancer submits work, and the client approves it to release payment.

- `src/` React 19 + Vite + Tailwind 4 frontend, wagmi/viem for the Ethereum wallet
- `server/` Go API (stdlib `net/http`, PostgreSQL via pgx): auth (email, Google, Sign-In with Ethereum), developers, jobs, milestones, chat
- `docker-compose.yml` a dedicated Postgres 17 on port 5434 (so it never clashes with other local databases)
- `backend/` the previous Express/Mongo API, kept for reference

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
