"use server";

import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { AppError } from "@/lib/api/errors";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";

export type ShellStatusResult =
  | { ok: true; contagens: Contagens | undefined; plano: Plano | undefined }
  | { ok: false; code: "FAILED" | "SESSAO_EXPIRADA" };

/**
 * A read-only action for the shell's poller (ADR-0011 rule 3 and note):
 * /me's counts and plan, nothing else (a minimal projection, no name or
 * e-mail), read from requireSession()'s own GET /v1/me. That call carries
 * X-Kybr-Poll, so it doesn't slide the idle session (QA plan Q2). No
 * session is SESSAO_EXPIRADA, a result (ADR-0011 Addendum 2: the leaf takes
 * the session-expiry path, with perdido=1 when a dialog holds a draft); any
 * other failure is FAILED (the leaf hides the counts silently).
 */
export async function pollShellStatusAction(): Promise<ShellStatusResult> {
  await assertPanelHost();
  try {
    const { contagens, plano } = (
      await requireSession({
        pollTimeoutMs: POLL_TIMEOUT_MS,
        onMissing: "result",
      })
    ).workspace;
    return { ok: true, contagens, plano };
  } catch (error) {
    if (error instanceof AppError && error.code !== "SESSAO_EXPIRADA")
      return { ok: false, code: "FAILED" };
    return sessionExpiredResult(error);
  }
}
