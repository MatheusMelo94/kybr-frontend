"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hideFirstSteps } from "@/lib/api/panel/home";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import { panelPath } from "@/lib/panel-paths";

export type HideFirstStepsResult =
  | { ok: true }
  | {
      ok: false;
      code: "SESSAO_EXPIRADA" | "VALOR_INVALIDO" | "NETWORK" | "UNAVAILABLE";
    };

const hideFirstStepsSchema = z.strictObject({ oculto: z.literal(true) });

/**
 * D-H2 from /: hides Primeiros passos for good, in ADR-0011's order: host,
 * strict zod, requireSession() as a result (Addendum 2), then the API.
 * NETWORK and UNAVAILABLE are unknown outcomes: the page re-reads (an
 * idempotent PUT, so a retry is safe).
 */
export async function hideFirstStepsAction(
  input: unknown,
): Promise<HideFirstStepsResult> {
  await assertPanelHost();
  if (!hideFirstStepsSchema.safeParse(input).success)
    return { ok: false, code: "VALOR_INVALIDO" };
  try {
    await requireSession({ onMissing: "result" });
  } catch (error) {
    return sessionExpiredResult(error);
  }

  const result = await hideFirstSteps();
  if (result.ok) {
    revalidatePath(panelPath("/"));
    return { ok: true };
  }
  const { code } = result.error;
  if (code === "SESSAO_EXPIRADA") return { ok: false, code };
  if (code === "NETWORK" || code === "TIMEOUT")
    return { ok: false, code: "NETWORK" };
  return { ok: false, code: "UNAVAILABLE" };
}
