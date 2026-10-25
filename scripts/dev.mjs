// Starts the whole stack with checks and plain-English errors.
//
//   npm run dev          Postgres + Go API (:3001) + Vite (:5173); milestones tracked off-chain
//   npm run dev:chain    the same plus a local Hardhat chain with the escrow contract deployed
//
// Stop it with Ctrl+C; that also stops everything it started.
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withChain = process.argv.includes("--chain");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.join(root, "contracts");
const children = [];

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const log = (s) => console.log(`${green("[dev]")} ${s}`);
function fail(msg) {
  console.error(`\n${red("✖")} ${msg}\n`);
  stop();
  process.exit(1);
}

function stop() {
  for (const c of children) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else c.kill("SIGTERM");
    } catch {}
  }
}
process.on("SIGINT", () => (stop(), process.exit(0)));
process.on("SIGTERM", () => (stop(), process.exit(0)));

function run(cmd, cwd, name, color, env = {}) {
  const p = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (d) => process.stdout.write(d.toString().split("\n").filter(Boolean).map((l) => tag + l).join("\n") + "\n");
  p.stdout.on("data", pipe);
  p.stderr.on("data", pipe);
  p.on("exit", (code) => {
    if (code && code !== 0) fail(`${name} stopped unexpectedly (exit ${code}). Scroll up for its error.`);
  });
  children.push(p);
  return p;
}

const can = (cmd) => {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const portBusy = (port) =>
  new Promise((res) => {
    const s = net.connect({ port, host: "localhost" });
    s.once("connect", () => (s.destroy(), res(true)));
    s.once("error", () => res(false));
  });
async function apiHealthy() {
  try {
    return (await fetch("http://localhost:3001/api/health", { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
async function waitPort(port, ms = 60000) {
  const t0 = Date.now();
  while (!(await portBusy(port))) {
    if (Date.now() - t0 > ms) fail(`Nothing started listening on port ${port} within ${ms / 1000}s.`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---- preflight ----
if (!can("go version")) fail("Go is not installed (or not on PATH). Install Go 1.22+ from https://go.dev/dl/ and reopen your terminal.");
if (!can("docker info")) fail("Docker is not running. Start Docker Desktop, wait until it says it is running, then run this again.");
if (withChain && !existsSync(path.join(contracts, "node_modules"))) fail("Contract tooling is not installed. Run `npm run contracts:install` once, then try again.");

log("starting Postgres (docker compose)…");
try {
  execSync("docker compose up -d --wait", { cwd: root, stdio: "inherit" });
} catch {
  fail("Could not start the database container. Is something else using port 5434? Run `docker compose logs db` for details.");
}

// ---- chain (optional) ----
let apiEnv = {};
if (withChain) {
  if (await portBusy(8545)) fail("Port 8545 is already in use (another Hardhat node?). Stop it and try again.");
  log("starting local blockchain…");
  run("npx hardhat node", contracts, "chain", "35");
  await waitPort(8545);
  const out = execSync("npx hardhat run scripts/deploy.js --network localhost", { cwd: contracts, encoding: "utf8" });
  const get = (k) => out.match(new RegExp(k + "=(\\S+)"))?.[1];
  apiEnv = { ESCROW_ADDRESS: get("ESCROW_ADDRESS"), CHAIN_ID: get("CHAIN_ID"), RPC_URL: get("RPC_URL") };
  if (!apiEnv.ESCROW_ADDRESS) fail("Deploying the contract printed no address:\n" + out);
  // Passed to the API process only, never written to server/.env, so a plain `npm run dev` afterwards still works.
  log(`escrow contract ${apiEnv.ESCROW_ADDRESS} on chain ${apiEnv.CHAIN_ID}`);
}

// ---- API ----
if (await portBusy(3001)) {
  if (!withChain && (await apiHealthy())) {
    log("an API is already running on :3001, reusing it");
  } else {
    fail(
      "Port 3001 is already in use by an older API process" +
        (withChain ? " (it would not be connected to the local chain)" : "") +
        ".\n  Close the terminal that is running it, or on Windows run:\n  powershell \"Get-NetTCPConnection -LocalPort 3001 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }\"",
    );
  }
} else {
  log("starting API…");
  run("go run .", path.join(root, "server"), "api", "32", apiEnv);
}

// ---- frontend ----
if (await portBusy(5173)) {
  log("the app is already running at http://localhost:5173, nothing more to start");
  stop();
  process.exit(0);
}
log("starting frontend…");
const web = run("npx vite", root, "web", "36");
void web;

await waitPort(5173).catch(() => {});
await new Promise((r) => setTimeout(r, 500));
for (let i = 0; i < 60 && !(await apiHealthy()); i++) await new Promise((r) => setTimeout(r, 1000));
console.log(`\n${green("✔ Ready")}  open ${"\x1b[1mhttp://localhost:5173\x1b[0m"}   (Ctrl+C stops everything)\n`);
await new Promise(() => {});
