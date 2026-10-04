"use server";

import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  meSchema,
  type Contagens,
  type Plano,
} from "@/lib/api/schemas/panel/me";

export type ShellStatusResult =
  | { ok: true; contagens: Contagens | undefined; plano: Plano | undefined }
  | { ok: false; code: "SESSAO_EXPIRADA" | "FAILED" };

/**
 * A read-only action for the shell's poller (ADR-0011 rule 3): /me's counts
 * and plan, nothing else (a minimal projection, no name or e-mail). A 401
 * becomes SESSAO_EXPIRADA; any other failure is FAILED (the leaf hides the
 * counts silently). X-Kybr-Poll marks it as background, so it doesn't
 * slide the 12 h idle session (QA plan Q2).
 */
export async function pollShellStatusAction(): Promise<ShellStatusResult> {
  const token = await sessionToken();
  if (token === undefined) return { ok: false, code: "SESSAO_EXPIRADA" };
  const result = await panelRequest({
    operation: "shell-status",
    path: apiPaths.panel.me(),
    schema: meSchema,
    headers: { "x-kybr-poll": "1" },
    sessionToken: token,
    timeoutMs: POLL_TIMEOUT_MS,
  });
  if (result.ok) {
    const { contagens, plano } = result.data.workspace;
    return { ok: true, contagens, plano };
  }
  return {
    ok: false,
    code:
      result.error.code === "SESSAO_EXPIRADA" ? "SESSAO_EXPIRADA" : "FAILED",
  };
}
