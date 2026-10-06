"use client";

import { useCallback } from "react";

import { useToast } from "@/components/panel/toast";
import { decideAction, type DecideResult } from "@/features/panel-fila/actions";
import { callAction } from "@/features/panel-fila/call-action";
import {
  FILA_NO_CASE,
  useFila,
} from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { nextCaseId } from "@/features/panel-fila/next-case";
import type { DecideInput } from "@/features/panel-fila/schemas";
import { useIntentKey } from "@/features/panel-fila/use-intent-key";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

/**
 * ok, a 409, a 4xx or the API's 5xx (UNAVAILABLE, T106: a definitive
 * failure): the key is spent. NETWORK (a dropped call, a timeout): unknown.
 */
function definitive(result: DecideResult): boolean {
  return result.ok || result.code !== "NETWORK";
}

/** Where a decided case's screen goes (D5): the next case, or /fila. */
export type DecisionTarget = { next: string | null; query: string };

/**
 * The steps every Fila decision shares (plan-m6 § 3.3), optimistic
 * (useDecide) or not (BlockDialog, T107): the call with its intent key (F5)
 * and bound (F6), the shell poller paused meanwhile (rule 3), and what each
 * outcome does. The callers decide what "still here" means (E3).
 */
export function useDecisionFlow(): {
  /** Before the call: the next case, from the list as rendered. */
  target: (caseId: string) => DecisionTarget;
  /** decideAction with the intent's key; a result after the bound only releases it. */
  call: (input: Omit<DecideInput, "idempotencyKey">) => Promise<DecideResult>;
  /** ok: the toast and a shell poll; then, if still here, the next case. */
  advance: (
    caseId: string,
    target: DecisionTarget,
    here: boolean,
    toast: string,
  ) => void;
  /** 409: decided elsewhere; the decided state with the conflict notice. */
  conflict: (
    caseId: string,
    decididoEm: string | undefined,
    here: boolean,
  ) => void;
  /** NETWORK: the offline hint, and the case re-read before any retry (F5). */
  unknown: (here: boolean) => void;
} {
  const {
    list,
    wasDecided,
    markDecided,
    openCase,
    setFlash,
    hintOffline,
    reread,
  } = useFila();
  const { take, release } = useIntentKey();
  const { show } = useToast();
  const { pause, resume, pollNow } = useShellStatus();
  const navigate = useSoftNavigate();

  const target = useCallback(
    (caseId: string): DecisionTarget => {
      const { ids, query } = list();
      // R1: a list that lags (or a stale snapshot) may still show a case
      // decided here; it is never the next one.
      const next = nextCaseId(
        ids.filter((id) => !wasDecided(id)),
        caseId,
      );
      return { next, query };
    },
    [list, wasDecided],
  );

  const call = useCallback(
    async (input: Omit<DecideInput, "idempotencyKey">) => {
      const { caseId, ...body } = input;
      const intent = { caseId, action: "decide", body };
      const idempotencyKey = take(intent);
      pause();
      const result = await callAction(
        decideAction,
        { ...input, idempotencyKey },
        {
          onLate: (late) => {
            if (definitive(late)) release(intent);
          },
        },
      );
      if (definitive(result)) release(intent);
      resume();
      return result;
    },
    [take, release, pause, resume],
  );

  const advance = useCallback(
    (
      caseId: string,
      { next, query }: DecisionTarget,
      here: boolean,
      toast: string,
    ) => {
      markDecided(caseId);
      show(toast, filaCopy["toast.audit"]);
      pollNow();
      if (!here) return;
      openCase(next ?? FILA_NO_CASE);
      navigate(
        next === null
          ? `/fila${query}`
          : `/fila/${encodeURIComponent(next)}${query}`,
        { push: true, scroll: false },
      );
    },
    [markDecided, show, pollNow, openCase, navigate],
  );

  const conflict = useCallback(
    (caseId: string, decididoEm: string | undefined, here: boolean) => {
      markDecided(caseId);
      setFlash(caseId, { kind: "conflict", decididoEm });
      if (here) reread();
    },
    [markDecided, setFlash, reread],
  );

  const unknown = useCallback(
    (here: boolean) => {
      hintOffline();
      if (here) reread();
    },
    [hintOffline, reread],
  );

  return { target, call, advance, conflict, unknown };
}
