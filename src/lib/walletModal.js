import { useSyncExternalStore } from "react";

// A tiny store so any code (a button, a transaction helper) can ask for a wallet and wait for the answer:
//   const address = await openWalletPicker();
// The dialog itself lives in Components/WalletModal.jsx.
let state = { open: false };
let waiting = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const subscribeWalletPicker = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useWalletPickerOpen = () => useSyncExternalStore(subscribeWalletPicker, () => state, () => state).open;

export function openWalletPicker() {
  return new Promise((resolve, reject) => {
    waiting.push({ resolve, reject });
    if (!state.open) {
      state = { open: true };
      emit();
    }
  });
}

export function closeWalletPicker(address) {
  const list = waiting;
  waiting = [];
  state = { open: false };
  emit();
  for (const w of list) {
    if (address) w.resolve(address);
    else w.reject(Object.assign(new Error("You closed the wallet picker."), { name: "UserRejectedRequestError" }));
  }
}
