"use server";

import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { AppError } from "@/lib/api/errors";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession } from "@/lib/api/panel/session";
import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";

export type ShellStatusResult =
  | { ok: true; contagens: Contagens | undefined; plano: Plano | undefined }
  | { ok: false; code: "FAILED" };

/**
 * A read-only action for the shell's poller (ADR-0011 rule 3 and note):
 * /me's counts and plan, nothing else (a minimal projection, no name or
 * e-mail), read from requireSession()'s own GET /v1/me. That call carries
 * X-Kybr-Poll, so it doesn't slide the idle session (QA plan Q2). No
 * session redirects to /entrar; any other failure is FAILED (the leaf hides
 * the counts silently).
 */
export async function pollShellStatusAction(): Promise<ShellStatusResult> {
  await assertPanelHost();
  try {
    const { contagens, plano } = (
      await requireSession({ pollTimeoutMs: POLL_TIMEOUT_MS })
    ).workspace;
    return { ok: true, contagens, plano };
  } catch (error) {
    // The redirect (a no-session) isn't an AppError: let it through.
    if (error instanceof AppError) return { ok: false, code: "FAILED" };
    throw error;
  }
}
