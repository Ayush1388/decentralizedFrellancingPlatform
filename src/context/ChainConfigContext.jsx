import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ChainConfigContext } from "./useChainConfig";

export function ChainConfigProvider({ children }) {
  const [chain, setChain] = useState(null);
  useEffect(() => {
    api("/api/config")
      .then((c) => setChain(c.chain || null))
      .catch(() => {});
  }, []);
  return <ChainConfigContext.Provider value={chain}>{children}</ChainConfigContext.Provider>;
}
