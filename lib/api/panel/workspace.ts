import "server-only";

import { redirect } from "next/navigation";

import { panelRequest } from "@/lib/api/panel/client";
import { sessionExpiredUrl, sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  categoriesSchema,
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
