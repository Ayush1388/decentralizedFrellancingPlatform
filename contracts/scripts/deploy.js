// Deploys JobEscrow (and a MockUSDC on local/test chains that have no real USDC).
//
//   npm run deploy:local      -> hardhat node on :8545, deploys MockUSDC + JobEscrow
//   npm run deploy:sepolia    -> uses Circle's Sepolia USDC unless USDC_ADDRESS is set
//
// Env: ARBITER (default: deployer), TREASURY (default: deployer), FEE_BPS (default 200), USDC_ADDRESS.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const arbiter = process.env.ARBITER || deployer.address;
  const treasury = process.env.TREASURY || deployer.address;
  const feeBps = Number(process.env.FEE_BPS || 200);

  let usdc = process.env.USDC_ADDRESS;
  let mock = false;
  if (!usdc) {
    if (chainId === 11155111n) usdc = SEPOLIA_USDC;
    else if (chainId === 1n) usdc = MAINNET_USDC;
    else {
      const m = await ethers.deployContract("MockUSDC");
      await m.waitForDeployment();
      usdc = await m.getAddress();
      mock = true;
    }
  }

  const escrow = await ethers.deployContract("JobEscrow", [usdc, arbiter, treasury, feeBps]);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  const out = { network: network.name, chainId: Number(chainId), escrow: address, usdc, mockUsdc: mock, arbiter, treasury, feeBps, deployer: deployer.address };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2) + "\n");

  console.log(`\nJobEscrow deployed to ${address} on ${network.name} (chain ${chainId})`);
  console.log(`USDC: ${usdc}${mock ? " (mock with faucet)" : ""}`);
  console.log(`Arbiter: ${arbiter}  Treasury: ${treasury}  Fee: ${feeBps / 100}%\n`);
  console.log("Add to server/.env, then restart the API:");
  console.log(`  ESCROW_ADDRESS=${address}`);
  console.log(`  CHAIN_ID=${chainId}`);
  console.log(`  RPC_URL=${network.config.url || "http://127.0.0.1:8545"}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
