import { useEffect, useState } from "react";
import { api } from "./api";

// What the API says about itself (email on, human check, categories...), fetched once per page load.
let promise;
export const loadSiteConfig = () => (promise ??= api("/api/config").catch(() => ({})));

const FALLBACK_CATEGORIES = ["Smart contracts", "Frontend", "Backend", "Full stack", "Design", "Security and audits", "Data and indexing", "DevOps", "Writing and docs", "Other"];

export function useSiteConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let live = true;
    loadSiteConfig().then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return { ready: cfg !== null, emailEnabled: !!cfg?.emailEnabled, turnstileSiteKey: cfg?.turnstileSiteKey || "", categories: cfg?.categories || FALLBACK_CATEGORIES };
}
