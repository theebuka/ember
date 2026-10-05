"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the command menu is open — apart from the menu itself, so the rail's
 * Search button can open it without importing cmdk and the dialog (decision 287).
 */
const listeners = new Set<() => void>();
let openState = false;

export function setCommandMenuOpen(next: boolean) {
  if (next === openState) return;
  openState = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useCommandMenuOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openState,
    () => false,
  );
}

export function openCommandMenu(): void {
  setCommandMenuOpen(true);
}

export function readCommandMenuOpen(): boolean {
  return openState;
}
