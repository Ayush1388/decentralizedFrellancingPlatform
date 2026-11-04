import { useState } from "react";

// Which layout a list uses, remembered per list. Storage can be blocked, so every access is guarded.
export function useViewMode(key, fallback = "swipe") {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(`view:${key}`) || fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (m) => {
    setMode(m);
    try {
      localStorage.setItem(`view:${key}`, m);
    } catch {
      /* the choice just is not remembered */
    }
  };
  return [mode, choose];
}
