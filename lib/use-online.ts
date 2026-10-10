"use client";

import { useSyncExternalStore } from "react";

// The browser's online state (T111, D8): navigator.onLine and its events.
// Shared by the Fila and the Monitoramento (promoted from panel-fila, T125).
// The server render assumes online.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
