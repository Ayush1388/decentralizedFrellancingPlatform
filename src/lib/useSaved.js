import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { useAuth } from "../context/useAuth";

// The set of job ids this person bookmarked, shared across every card on the page.
let ids = new Set();
let loadedFor = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const snapshot = () => ids;

export function useSaved() {
  const { user } = useAuth();
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot,
  );

  useEffect(() => {
    if (!user) {
      if (ids.size) {
        ids = new Set();
        loadedFor = null;
        emit();
      }
      return;
    }
    if (loadedFor === user.id) return;
    loadedFor = user.id;
    api("/api/saved-ids")
      .then((list) => {
        ids = new Set(list);
        emit();
      })
      .catch(() => {
        loadedFor = null;
      });
  }, [user]);

  const toggle = useCallback(async (jobId) => {
    const was = ids.has(jobId);
    ids = new Set(was ? [...ids].filter((x) => x !== jobId) : [...ids, jobId]); // update first, undo if the server says no
    emit();
    try {
      await api(`/api/jobs/${jobId}/save`, { method: was ? "DELETE" : "POST" });
    } catch {
      ids = new Set(was ? [...ids, jobId] : [...ids].filter((x) => x !== jobId));
      emit();
    }
  }, []);

  return { saved: current, toggle, signedIn: !!user };
}
