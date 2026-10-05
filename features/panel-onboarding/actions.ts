"use server";

import { revalidatePath } from "next/cache";

import { ONBOARDING_NEXT } from "@/features/panel-onboarding/next";
import { onboardingSchema } from "@/features/panel-onboarding/schemas";
import {
  onboardingIssues,
  type OnboardingField,
} from "@/features/panel-onboarding/validation";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession } from "@/lib/api/panel/session";
import { saveOnboarding } from "@/lib/api/panel/workspace";
import { panelPath } from "@/lib/panel-paths";

export type OnboardingResult =
  | { ok: true; next: string }
  | { ok: false; code: "INVALID"; fields: OnboardingField[] }
  | { ok: false; code: "SESSAO_EXPIRADA" | "NETWORK" };

function fieldsOf(input: unknown): OnboardingField[] {
  const value = (input ?? {}) as {
    contato_vendedor?: { tipo?: unknown; valor?: unknown };
    categoria?: unknown;
  };
  const issues = onboardingIssues({
    tipo: value.contato_vendedor?.tipo === "url" ? "url" : "email",
    valor:
      typeof value.contato_vendedor?.valor === "string"
        ? value.contato_vendedor.valor
        : "",
    categoria: typeof value.categoria === "string" ? value.categoria : "",
  });
  return issues.length > 0 ? issues : ["valor"];
}

/**
 * D-W3: saves the seller contact and category (onboarding step 1), in
 * ADR-0011's order: host, zod, requireSession() (no session → /entrar),
 * then the API. A 401 after that comes back as SESSAO_EXPIRADA for the
 * client to send Renata to /entrar (ADR-0009 rule 7).
 */
export async function saveOnboardingAction(
  input: unknown,
): Promise<OnboardingResult> {
  await assertPanelHost();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID", fields: fieldsOf(input) };
  await requireSession();

  const result = await saveOnboarding(parsed.data);
  if (result.ok) {
    // The shell and the onboarding gate read /me: refresh the whole panel.
    revalidatePath(panelPath("/"), "layout");
    return { ok: true, next: ONBOARDING_NEXT };
  }
  const { error } = result;
  if (error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  if (error.code === "VALOR_INVALIDO")
    return {
      ok: false,
      code: "INVALID",
      fields: [error.field === "categoria" ? "categoria" : "valor"],
    };
  return { ok: false, code: "NETWORK" };
}
