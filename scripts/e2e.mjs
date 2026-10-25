// End-to-end check of the money path with REAL components: a Hardhat chain, the deployed contracts,
// the Go API reading real receipts from that chain, and Postgres.
//
//   node scripts/e2e.mjs
//
// Uses its own throwaway database, chain port (8546) and API port (3999); it never touches dev data.
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.join(root, "contracts");
const { ethers } = createRequire(path.join(contracts, "x.js"))("ethers");

const API = "http://127.0.0.1:3999";
const RPC = "http://127.0.0.1:8546";
const DB = "e2e_" + Date.now();
const procs = [];

function killAll() {
  for (const p of procs) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" });
      else p.kill("SIGTERM");
    } catch {}
  }
}
function start(cmd, cwd, env = {}) {
  const p = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  p.out = "";
  p.stdout.on("data", (d) => (p.out += d));
  p.stderr.on("data", (d) => (p.out += d));
  procs.push(p);
  return p;
}
async function waitFor(fn, what, ms = 120000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await fn()) return;
    } catch {}
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
const portOpen = (port) =>
  new Promise((res) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), res(true)));
    s.once("error", () => res(false));
  });

async function call(method, p, token, body) {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(method, p, token, body) {
  const r = await call(method, p, token, body);
  assert.ok(r.status < 300, `${method} ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const USDC = (n) => BigInt(Math.round(n * 1e6));
const step = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);

try {
  // ---------- infrastructure ----------
  execSync("docker compose up -d --wait", { cwd: root, stdio: "ignore" });
  execSync(`docker exec freelance-db psql -U freelance -c "CREATE DATABASE ${DB}"`, { stdio: "ignore" });

  start("npx hardhat node --port 8546", contracts);
  await waitFor(() => portOpen(8546), "hardhat node");
  const deployOut = execSync("npx hardhat run scripts/deploy.js --network e2e", { cwd: contracts, encoding: "utf8" });
  const escrowAddress = deployOut.match(/ESCROW_ADDRESS=(\S+)/)[1];
  step(`chain up, JobEscrow deployed at ${escrowAddress}`);

  const api = start("go run .", path.join(root, "server"), {
    PORT: "3999",
    DATABASE_URL: `postgres://freelance:freelance@localhost:5434/${DB}?sslmode=disable`,
    JWT_SECRET: "e2e-secret",
    ESCROW_ADDRESS: escrowAddress,
    CHAIN_ID: "31337",
    RPC_URL: RPC,
    ADMIN_EMAILS: "admin@e2e.io",
    FRONTEND_URL: "http://localhost:5173",
  });
  await waitFor(async () => (await fetch(API + "/api/health")).ok, "API");
  const cfg = await ok("GET", "/api/config");
  assert.equal(cfg.chain.escrow.toLowerCase(), escrowAddress.toLowerCase());
  step(`API up in on-chain mode (USDC ${cfg.chain.usdc})`);

  // ---------- actors ----------
  // cacheTimeout -1: ethers otherwise caches the latest block number, so gas estimates can run against a stale block.
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  const [arbiterSigner, clientSigner, devSigner, strangerSigner] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const escrowAbi = JSON.parse(readFileSync(path.join(contracts, "artifacts/contracts/JobEscrow.sol/JobEscrow.json"), "utf8")).abi;
  const usdcAbi = JSON.parse(readFileSync(path.join(contracts, "artifacts/contracts/MockUSDC.sol/MockUSDC.json"), "utf8")).abi;
  const escrow = (s) => new ethers.Contract(escrowAddress, escrowAbi, s);
  // Hardhat reports custom errors either by name or as a raw selector, so accept both.
  const iface = new ethers.Interface(escrowAbi);
  const reverts = async (promise, errName, why) => {
    let msg;
    try {
      await promise;
    } catch (e) {
      msg = String(e.message || e);
    }
    assert.ok(msg !== undefined, `${why}: the call did not revert`);
    assert.ok(msg.includes(iface.getError(errName).selector) || msg.includes(`${errName}(`), `${why}: expected ${errName}, got: ${msg.slice(0, 400)}`);
  };
  const usdc = (s) => new ethers.Contract(cfg.chain.usdc, usdcAbi, s);
  const wait = async (txPromise) => {
    const tx = await txPromise;
    const rc = await tx.wait();
    return rc.hash;
  };

  await wait(usdc(arbiterSigner).mint(await clientSigner.getAddress(), USDC(10_000)));

  async function signup(name, email, signer) {
    const s = await ok("POST", "/api/auth/signup", null, { name, email, password: "password123" });
    const address = await signer.getAddress();
    const { message } = await ok("GET", `/api/auth/wallet/nonce?address=${address}`);
    const signature = await signer.signMessage(message);
    const linked = await ok("POST", "/api/auth/wallet/verify", s.token, { address, signature });
    assert.equal(linked.user.walletAddress, ethers.getAddress(address));
    return s.token;
  }
  const clientT = await signup("Client", "client@e2e.io", clientSigner);
  const devT = await signup("Freelancer", "dev@e2e.io", devSigner);
  const strangerT = await signup("Stranger", "stranger@e2e.io", strangerSigner);
  step("three accounts created, wallets linked by signed message");

  // ---------- job, hire, escrow ----------
  let job = await ok("POST", "/api/jobs", clientT, {
    title: "End to end escrow job",
    description: "A job that exercises every step of the escrow against a real chain.",
    milestones: [{ title: "Design", amount: 400 }, { title: "Build", amount: 900 }],
  });
  const jobId = job.id;
  await ok("POST", `/api/jobs/${jobId}/apply`, devT, { cover: "I can do this work quickly and well." });
  job = await ok("GET", `/api/jobs/${jobId}`, clientT);
  job = await ok("POST", `/api/jobs/${jobId}/hire`, clientT, { applicationId: job.applications[0].id });
  assert.equal(job.freelancerWallet, ethers.getAddress(await devSigner.getAddress()));

  let r = await call("POST", `/api/milestones/${job.milestones[0].id}/fund`, clientT, { txHash: "0x" + "ab".repeat(32) });
  assert.equal(r.status, 409, "funding before the escrow exists must be refused");

  const createHash = await wait(escrow(clientSigner).createEscrow(job.freelancerWallet, job.milestones.map((m) => m.amount)));
  r = await call("POST", `/api/jobs/${jobId}/escrow`, strangerT, { txHash: createHash });
  assert.equal(r.status, 403, "only the client can attach the escrow");
  job = await ok("POST", `/api/jobs/${jobId}/escrow`, clientT, { txHash: createHash });
  const escrowId = job.escrowId;
  assert.ok(escrowId >= 1);
  step(`escrow #${escrowId} opened on-chain and verified by the API`);

  const [m0, m1] = job.milestones;
  const url = "https://github.com/acme/repo/pull/42";

  // ---------- milestone 1: fund -> submit -> approve -> withdraw ----------
  await wait(usdc(clientSigner).approve(escrowAddress, USDC(400)));
  const fund0 = await wait(escrow(clientSigner).fund(escrowId, 0));
  r = await call("POST", `/api/milestones/${m1.id}/fund`, clientT, { txHash: fund0 });
  assert.equal(r.status, 400, "a funding tx for milestone 1 must not fund milestone 2");
  job = await ok("POST", `/api/milestones/${m0.id}/fund`, clientT, { txHash: fund0 });
  assert.equal(job.milestones[0].status, "funded");
  step("milestone 1 funded (USDC locked in the contract)");

  await reverts(escrow(devSigner).claim(escrowId, 0), "BadStatus", "cannot claim unsubmitted work");
  const sub0 = await wait(escrow(devSigner).submit(escrowId, 0, ethers.keccak256(ethers.toUtf8Bytes(url))));
  r = await call("POST", `/api/milestones/${m0.id}/submit`, devT, { txHash: sub0, deliverableUrl: "https://evil.example/swapped" });
  assert.equal(r.status, 400, "a deliverable link that does not hash to the on-chain value is rejected");
  job = await ok("POST", `/api/milestones/${m0.id}/submit`, devT, { txHash: sub0, deliverableUrl: url });
  assert.equal(job.milestones[0].status, "submitted");
  const onchain0 = await escrow(devSigner).getMilestone(escrowId, 0);
  assert.equal(Number(onchain0.status), 2, `on-chain milestone should be Submitted(2), got ${onchain0.status}`);
  await reverts(escrow(devSigner).claim(escrowId, 0), "TooEarly", "claim is blocked inside the review window");
  r = await call("POST", `/api/milestones/${m0.id}/approve`, strangerT, { txHash: sub0 });
  assert.equal(r.status, 403, "strangers cannot push state");

  const app0 = await wait(escrow(clientSigner).approve(escrowId, 0));
  job = await ok("POST", `/api/milestones/${m0.id}/approve`, clientT, { txHash: app0 });
  assert.equal(job.milestones[0].status, "released");
  assert.equal(job.milestones[0].freelancerBps, 10000);
  step("milestone 1 approved and released; API mirrors the on-chain event");

  const before = await usdc(devSigner).balanceOf(await devSigner.getAddress());
  await wait(escrow(devSigner).withdraw());
  const gained = (await usdc(devSigner).balanceOf(await devSigner.getAddress())) - before;
  assert.equal(gained, USDC(392), "freelancer receives 400 minus the 2% fee");
  step("freelancer withdrew 392 USDC (400 less 2% fee)");

  // ---------- milestone 2: fund -> dispute -> arbiter 60/40 ----------
  await wait(usdc(clientSigner).approve(escrowAddress, USDC(900)));
  const fund1 = await wait(escrow(clientSigner).fund(escrowId, 1));
  await ok("POST", `/api/milestones/${m1.id}/fund`, clientT, { txHash: fund1 });
  const dsp = await wait(escrow(devSigner).dispute(escrowId, 1));
  job = await ok("POST", `/api/milestones/${m1.id}/dispute`, devT, { txHash: dsp });
  assert.equal(job.milestones[1].status, "disputed");
  await reverts(escrow(clientSigner).approve(escrowId, 1), "BadStatus", "a disputed milestone is frozen");
  await reverts(escrow(devSigner).resolve(escrowId, 1, 6000), "NotArbiter", "only the arbiter can rule");

  const res = await wait(escrow(arbiterSigner).resolve(escrowId, 1, 6000));
  job = await ok("POST", `/api/milestones/${m1.id}/resolve`, clientT, { txHash: res });
  assert.equal(job.milestones[1].status, "resolved");
  assert.equal(job.milestones[1].freelancerBps, 6000);
  assert.equal(job.status, "completed");
  step("dispute resolved 60/40 by the arbiter; job completed");

  const c0 = await usdc(clientSigner).balanceOf(await clientSigner.getAddress());
  const d0 = await usdc(devSigner).balanceOf(await devSigner.getAddress());
  await wait(escrow(clientSigner).withdraw());
  await wait(escrow(devSigner).withdraw());
  assert.equal((await usdc(clientSigner).balanceOf(await clientSigner.getAddress())) - c0, USDC(360), "client gets 40% of 900 back");
  assert.equal((await usdc(devSigner).balanceOf(await devSigner.getAddress())) - d0, USDC(529.2), "freelancer gets 60% of 900 less 2%");
  assert.equal(await usdc(arbiterSigner).balanceOf(escrowAddress), USDC(18.8) - USDC(0), "only the unwithdrawn treasury fees remain: 8 + 10.8");
  step("final balances: client +360, freelancer +529.20, treasury fees (18.80) still in the contract");

  console.log("\n\x1b[32mAll end-to-end checks passed.\x1b[0m");
} catch (e) {
  console.error("\n\x1b[31mE2E FAILED\x1b[0m", e);
  for (const p of procs) if (p.out) console.error("---- process output (tail) ----\n" + p.out.slice(-1500));
  process.exitCode = 1;
} finally {
  killAll();
  try {
    execSync(`docker exec freelance-db psql -U freelance -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)"`, { stdio: "ignore" });
  } catch {}
}
