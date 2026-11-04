import { createConfig, http } from "wagmi";
import { base, baseSepolia, hardhat, mainnet, sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// Wallets people can use:
//  - any browser wallet (MetaMask, Phantom, Rabby, Brave, ...): wagmi detects each installed one (EIP-6963) and lists it by name
//  - Phantom also through its own window.phantom.ethereum, for versions that do not announce themselves
//  - Coinbase Wallet: its app or extension, no setup needed
//  - WalletConnect: lets phone wallets connect by QR code; turned on by setting VITE_WALLETCONNECT_PROJECT_ID
//    (a free project id from cloud.reown.com)
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [injected({ target: "phantom" }), injected(), coinbaseWallet({ appName: "Blockchain Picture House" })];
if (projectId) connectors.push(walletConnect({ projectId, showQrModal: true }));
export const walletConnectEnabled = !!projectId;

// hardhat (31337) is the local dev chain from `npm run node` in contracts/.
export const config = createConfig({
  chains: [sepolia, baseSepolia, base, mainnet, hardhat],
  connectors,
  transports: {
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});

// Circle's USDC deployments, used when the API is not pointing at a custom token.
export const USDC = {
  [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const EXPLORERS = {
  [mainnet.id]: "https://etherscan.io",
  [sepolia.id]: "https://sepolia.etherscan.io",
  [base.id]: "https://basescan.org",
  [baseSepolia.id]: "https://sepolia.basescan.org",
};
export const explorerTx = (chainId, hash) => (EXPLORERS[chainId] && hash ? `${EXPLORERS[chainId]}/tx/${hash}` : null);
export const explorerAddress = (chainId, addr) => (EXPLORERS[chainId] && addr ? `${EXPLORERS[chainId]}/address/${addr}` : null);

export const TEST_CHAINS = [sepolia.id, baseSepolia.id, hardhat.id];
export const LOCAL_CHAIN_ID = hardhat.id;
