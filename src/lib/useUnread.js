import { useEffect, useSyncExternalStore } from "react";
import { api, getToken } from "./api";
import { useAuth } from "../context/useAuth";

// What the signed-in person has not read yet, shared by the whole page (bell, nav dot, dashboard, chats).
// One poll every 30 seconds while the tab is visible; chats call refreshUnread() right after reading.
const EMPTY = { notifications: 0, messages: 0, jobs: {}, apps: {} };
let data = EMPTY;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function refreshUnread() {
  if (!getToken()) {
    if (data !== EMPTY) {
      data = EMPTY;
      emit();
    }
    return;
  }
  try {
    data = await api("/api/unread");
    emit();
  } catch {
    /* keep the last numbers */
  }
}

export function useUnread() {
  const { user } = useAuth();
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => data,
  );
  useEffect(() => {
    if (!user) {
      data = EMPTY;
      emit();
      return;
    }
    refreshUnread();
    const t = setInterval(() => document.visibilityState === "visible" && refreshUnread(), 30_000);
    const onFocus = () => refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);
  return value;
}
