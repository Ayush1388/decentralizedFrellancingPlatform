import { createContext, useContext } from "react";

// null while loading or when the API runs in off-chain preview mode.
export const ChainConfigContext = createContext(null);
export const useChainConfig = () => useContext(ChainConfigContext);
