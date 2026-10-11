import "server-only";

import { redirect } from "next/navigation";

import type { ApiResult } from "@/lib/api/client";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionExpiredUrl, sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import { ownNameResponseSchema } from "@/lib/api/schemas/panel/account";
import {
  categoriesSchema,
  workspaceSchema,
  type Category,
} from "@/lib/api/schemas/panel/workspace";

// The workspace's data functions (D-W2, D-W3). Panel data is never cached
// across requests: the panel client forces no-store (P06).

/**
 * D-W2: the seller categories for the onboarding. No session → /entrar;
 * any other failure throws to the route's error.tsx (error.load.*).
 */
export async function getCategories(): Promise<Category[]> {
  const token = await sessionToken();
  if (token === undefined) redirect(await sessionExpiredUrl());
  const result = await panelRequest({
    operation: "categories",
    path: apiPaths.panel.categories(),
    schema: categoriesSchema,
    sessionToken: token,
  });
  if (result.ok) return result.data;
  if (result.error.code === "SESSAO_EXPIRADA")
    redirect(await sessionExpiredUrl());
  throw result.error;
}

/**
 * D-W3: saves the onboarding step (a body the action zod-parsed), for an
 * action that already passed requireSession(). A 401 here (the session ended
 * in between) comes back as SESSAO_EXPIRADA (ADR-0011 note, rule 3).
 */
export async function saveOnboarding(
  body: object,
): Promise<ApiResult<unknown>> {
  const token = await sessionToken();
  return panelRequest({
    operation: "workspace-onboarding",
    path: apiPaths.panel.workspace(),
    method: "PUT",
    body,
    schema: workspaceSchema,
    ...(token !== undefined && { sessionToken: token }),
  });
}

/**
 * D-W3 from Configurações: the platform name and the seller contact (a body
 * the action zod-parsed). A failure is a result, never a throw.
 */
export async function saveWorkspace(body: {
  nome: string;
  contato_vendedor: { tipo: "email" | "url"; valor: string };
}): Promise<ApiResult<unknown>> {
  const token = await sessionToken();
  return panelRequest({
    operation: "workspace-settings",
    path: apiPaths.panel.workspace(),
    method: "PUT",
    body,
    schema: workspaceSchema,
    ...(token !== undefined && { sessionToken: token }),
  });
}

/** D-W4 (C-M8-8): the user's own name. A failure is a result, never a throw. */
export async function saveOwnName(body: {
  nome: string;
}): Promise<ApiResult<unknown>> {
  const token = await sessionToken();
  return panelRequest({
    operation: "me-name",
    path: apiPaths.panel.me(),
    method: "PUT",
    body,
    schema: ownNameResponseSchema,
    ...(token !== undefined && { sessionToken: token }),
  });
}
