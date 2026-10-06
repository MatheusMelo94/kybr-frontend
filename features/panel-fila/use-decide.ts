"use client";

import { startTransition, useCallback, useState } from "react";

import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { useDecisionFlow } from "@/features/panel-fila/use-decision-flow";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import { useNavigationGuard } from "@/lib/navigation/navigation-guard";

/** The optimistic decisions (plan-m6 § 3.3): bloquear is a dialog (T107). */
export type QuickDecisao = "aprovar" | "manter";

const TOAST = { aprovar: "toast.approved", manter: "toast.kept" } as const;

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
  const { setRemoval, focusCase, setFlash } = useFila();
  const flow = useDecisionFlow();
  const arm = useNavigationGuard();
  const expire = useSessionExpiry();
  const [busy, setBusy] = useState(false);
  const { target, call, advance, conflict, unknown } = flow;

  const decide = useCallback(
    (caseId: string, decisao: QuickDecisao, razao: string) => {
      const guard = arm();
      const to = target(caseId);
      setFlash(caseId, null);
      setBusy(true);
      startTransition(async () => {
        setRemoval({ id: caseId, next: to.next });
        const result = await call({ caseId, decisao });
        setBusy(false);
        const here = guard.onOrigin();
        if (result.ok) {
          advance(
            caseId,
            to,
            here,
            fill(filaCopy[TOAST[decisao]], { razao_social: razao }),
          );
          return;
        }
        if (result.code === "SESSAO_EXPIRADA") {
          expire();
          return;
        }
        if (result.code === "CASO_JA_DECIDIDO")
          conflict(caseId, result.decididoEm, here);
        else {
          setFlash(caseId, { kind: "decide-error" });
          if (result.code === "NETWORK") unknown(here);
        }
        if (here) focusCase(caseId);
      });
    },
    [
      arm,
      target,
      call,
      advance,
      conflict,
      unknown,
      expire,
      setFlash,
      setRemoval,
      focusCase,
    ],
  );

  return { decide, busy };
}
