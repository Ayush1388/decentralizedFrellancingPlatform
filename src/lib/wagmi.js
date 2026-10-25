import { createConfig, http } from "wagmi";
import { hardhat, mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// hardhat (31337) is the local dev chain from `npm run node` in contracts/.
export const config = createConfig({
  chains: [sepolia, mainnet, hardhat],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});

// Circle's USDC deployments, used when the API is not pointing at a custom token.
export const USDC = {
  [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export const LOCAL_CHAIN_ID = hardhat.id;
