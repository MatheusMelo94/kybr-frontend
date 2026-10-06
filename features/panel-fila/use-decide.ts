"use client";

import { startTransition, useCallback, useState } from "react";

import { useToast } from "@/components/panel/toast";
import { decideAction, type DecideResult } from "@/features/panel-fila/actions";
import { callAction } from "@/features/panel-fila/call-action";
import {
  FILA_NO_CASE,
  useFila,
} from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { nextCaseId } from "@/features/panel-fila/next-case";
import { useIntentKey } from "@/features/panel-fila/use-intent-key";
import { fill } from "@/features/panel-shell/format";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import {
  useNavigationGuard,
  type NavigationGuard,
} from "@/lib/navigation/navigation-guard";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

/** The optimistic decisions (plan-m6 § 3.3): bloquear is a dialog (T107). */
export type QuickDecisao = "aprovar" | "manter";

const TOAST = { aprovar: "toast.approved", manter: "toast.kept" } as const;

/**
 * ok, a 409, a 4xx or the API's 5xx (UNAVAILABLE, T106: a definitive
 * failure): the key is spent. NETWORK (a dropped call, a timeout): unknown.
 */
function definitive(result: DecideResult): boolean {
  return result.ok || result.code !== "NETWORK";
}

type Failure = Exclude<DecideResult, { ok: true }>;

/**
 * Aprovar / Manter aprovado, plan-m6 § 3.3 (D13: await, then navigate):
 * the case leaves the list at once and the next one is selected, with the
 * detail skeleton, while the URL stays /fila/{id} (the action's owner, F7).
 * Only after ok: the toast, a shell poll, then the soft navigation to the
 * next case (or /fila) with focus on its heading. Anything else ends the
 * transition and the case is back in place, its heading focused (Q6), with
 * a flash (T106): fila.decide.error, or fila.decide.conflict on a 409. A 409
 * or an unknown outcome (NETWORK: kept key, offline hint) re-reads the case,
 * so one that was decided shows decided, with no retry. The shell poller is
 * paused meanwhile (rule 3). A result after DECIDE_TIMEOUT_MS only releases
 * the key: the flash and the re-read stay.
 * E3 (plan-m6 § 18): after the await, the navigation, the re-read and the
 * focus move happen only if Renata is still on /fila/{id} with no newer soft
 * navigation (guard.onOrigin()). Liveness is the Fila layout's, which that
 * origin implies: this leaf itself is replaced by the skeleton while the
 * decision is in flight (D13), so its own unmount proves nothing. The toast,
 * markDecided, the flash and the key release always happen.
 */
export function useDecide(): {
  decide: (caseId: string, decisao: QuickDecisao, razao: string) => void;
  busy: boolean;
} {
  const {
    setRemoval,
    list,
    openCase,
    focusCase,
    markDecided,
    wasDecided,
    setFlash,
    hintOffline,
    reread,
  } = useFila();
  const { take, release } = useIntentKey();
  const { show } = useToast();
  const { pause, resume, pollNow } = useShellStatus();
  const navigate = useSoftNavigate();
  const arm = useNavigationGuard();
  const expire = useSessionExpiry();
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (caseId: string, result: Failure, guard: NavigationGuard) => {
      if (result.code === "SESSAO_EXPIRADA") {
        expire();
        return;
      }
      const here = guard.onOrigin();
      if (result.code === "CASO_JA_DECIDIDO") {
        markDecided(caseId);
        setFlash(caseId, { kind: "conflict", decididoEm: result.decididoEm });
        if (here) reread();
      } else {
        setFlash(caseId, { kind: "decide-error" });
        if (result.code === "NETWORK") {
          hintOffline();
          if (here) reread();
        }
      }
      if (here) focusCase(caseId);
    },
    [expire, markDecided, setFlash, reread, hintOffline, focusCase],
  );

  const decide = useCallback(
    (caseId: string, decisao: QuickDecisao, razao: string) => {
      const intent = { caseId, action: "decide", body: { decisao } };
      const idempotencyKey = take(intent);
      const guard = arm();
      const { ids, query } = list();
      // R1: a list that lags (or a stale snapshot) may still show a case
      // decided here; it is never the next one.
      const next = nextCaseId(
        ids.filter((id) => !wasDecided(id)),
        caseId,
      );
      setFlash(caseId, null);
      setBusy(true);
      pause();
      startTransition(async () => {
        setRemoval({ id: caseId, next });
        const result = await callAction(
          decideAction,
          { caseId, idempotencyKey, decisao },
          {
            onLate: (late) => {
              if (definitive(late)) release(intent);
            },
          },
        );
        if (definitive(result)) release(intent);
        resume();
        setBusy(false);
        if (!result.ok) {
          fail(caseId, result, guard);
          return;
        }
        markDecided(caseId);
        show(
          fill(filaCopy[TOAST[decisao]], { razao_social: razao }),
          filaCopy["toast.audit"],
        );
        pollNow();
        if (!guard.onOrigin()) return;
        openCase(next ?? FILA_NO_CASE);
        navigate(
          next === null
            ? `/fila${query}`
            : `/fila/${encodeURIComponent(next)}${query}`,
          { push: true, scroll: false },
        );
      });
    },
    [
      fail,
      arm,
      take,
      release,
      list,
      wasDecided,
      markDecided,
      setFlash,
      setRemoval,
      pause,
      resume,
      show,
      pollNow,
      openCase,
      navigate,
    ],
  );

  return { decide, busy };
}
