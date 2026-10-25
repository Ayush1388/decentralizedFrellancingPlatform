// `npm run dev:chain` — the full stack with a local blockchain:
//   Postgres -> Hardhat node (:8545) -> deploy MockUSDC + JobEscrow -> Go API wired to it -> Vite.
// Point MetaMask at http://127.0.0.1:8545 (chain 31337) and import a Hardhat test account.
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.join(root, "contracts");
const children = [];
const run = (cmd, cwd, name, color, env = {}) => {
  const p = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const s of [p.stdout, p.stderr]) s.on("data", (d) => process.stdout.write(d.toString().split("\n").filter(Boolean).map((l) => tag + l).join("\n") + "\n"));
  children.push(p);
  return p;
};
const stop = () => {
  for (const c of children) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else c.kill("SIGTERM");
    } catch {}
  }
};
process.on("SIGINT", () => (stop(), process.exit(0)));
process.on("SIGTERM", () => (stop(), process.exit(0)));

const waitPort = (port, ms = 60000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tryOnce = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => (s.destroy(), resolve()));
      s.once("error", () => (s.destroy(), Date.now() - t0 > ms ? reject(new Error(`port ${port} never opened`)) : setTimeout(tryOnce, 500)));
    };
    tryOnce();
  });

if (!existsSync(path.join(contracts, "node_modules"))) {
  console.error("Run `npm install` inside contracts/ first.");
  process.exit(1);
}

execSync("docker compose up -d --wait", { cwd: root, stdio: "inherit" });
run("npx hardhat node", contracts, "chain", "35");
await waitPort(8545);

const out = execSync("npx hardhat run scripts/deploy.js --network localhost", { cwd: contracts, encoding: "utf8" });
const get = (k) => out.match(new RegExp(k + "=(\\S+)"))?.[1];
const vars = { ESCROW_ADDRESS: get("ESCROW_ADDRESS"), CHAIN_ID: get("CHAIN_ID"), RPC_URL: get("RPC_URL") };
if (!vars.ESCROW_ADDRESS) throw new Error("deploy did not print an address:\n" + out);
// Passed to the API process only, never written to server/.env, so a plain `npm run dev` afterwards still works.
console.log(`\x1b[32m[dev]\x1b[0m escrow ${vars.ESCROW_ADDRESS} on chain ${vars.CHAIN_ID}`);

run("go run .", path.join(root, "server"), "api", "32", vars);
run("npx vite", root, "web", "36");
await new Promise(() => {});
