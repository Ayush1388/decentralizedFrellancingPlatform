// Copies the compiled ABIs to where the frontend and the Go API read them.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const art = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`), "utf8"));

const escrow = art("JobEscrow").abi;
const usdc = art("MockUSDC").abi;

fs.mkdirSync(path.join(root, "src", "contracts"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "contracts", "JobEscrow.abi.json"), JSON.stringify(escrow, null, 2) + "\n");
fs.writeFileSync(path.join(root, "src", "contracts", "MockUSDC.abi.json"), JSON.stringify(usdc, null, 2) + "\n");
fs.writeFileSync(path.join(root, "server", "escrow_abi.json"), JSON.stringify(escrow) + "\n");
console.log("ABIs exported to src/contracts and server/escrow_abi.json");
