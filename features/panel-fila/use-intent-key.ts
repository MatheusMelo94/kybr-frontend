"use client";

import { useCallback } from "react";

import { useFila } from "@/features/panel-fila/components/fila-provider";

// F5: the Idempotency-Key belongs to the intent (caseId, action, body). It is
// created on the first press, reused on every retry while the body is the
// same, and released only after a definitive result. The keys live in
// FilaProvider (the layout), never in page or dialog state.

type Intent = { caseId: string; action: string; body: unknown };

/** The intent's identity: a different body is a different intent (a new key). */
function intentOf({ caseId, action, body }: Intent): string {
  return JSON.stringify([caseId, action, body]);
}

export function useIntentKey(): {
  take: (intent: Intent) => string;
  release: (intent: Intent) => void;
} {
  const { intentKey, releaseKey } = useFila();
  const take = useCallback(
    (intent: Intent) => intentKey(intentOf(intent)),
    [intentKey],
  );
  const release = useCallback(
    (intent: Intent) => releaseKey(intentOf(intent)),
    [releaseKey],
  );
  return { take, release };
}
