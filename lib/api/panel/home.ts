import "server-only";

import { z } from "zod";

import type { ApiResult } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import { dashboardSchema, type Dashboard } from "@/lib/api/schemas/panel/home";
import { maskCnpj } from "@/lib/cnpj";
import { maskCpf } from "@/lib/cpf";
import { reportMarker } from "@/lib/monitoring";

// Início's data functions (D-H1, D-H2 + C-M8-1, Pre-Contract), through the
// panel client (no-store forced, P06; the bearer from the DAL; the BFF
// key). Callers have already passed requireSession() (ADR-0011 Addendum 1).

/** The body comes back raw: it's parsed here, so a failure logs shape only (F11). */
const raw = z.unknown();

/** A razão social with any embedded CPF masked (MEI, X7; Security O-F4). */
const maskName = (name: string | null): string | null =>
  name === null ? null : maskCpf(name);

/**
 * D-H1: the dashboard. Every card may be missing (the page shows that card's
 * error alone, plan-m8 D2). CNPJs and CPFs in names are masked here, so the
 * wire form never reaches a prop (O-F4). Throws SESSAO_EXPIRADA or
 * UNAVAILABLE (the page's error.tsx).
 */
export async function getDashboard(): Promise<Dashboard> {
  const operation = "dashboard";
  const token = await sessionToken();
  if (token === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  const result = await panelRequest({
    operation,
    path: apiPaths.panel.dashboard(),
    schema: raw,
    sessionToken: token,
  });
  if (!result.ok) {
    if (result.error.code === "SESSAO_EXPIRADA") throw result.error;
    throw new AppError({
      code: "UNAVAILABLE",
      status: result.error.status,
      requestId: result.error.requestId,
    });
  }
  const parsed = dashboardSchema.safeParse(result.data);
  if (!parsed.success) {
    reportMarker("DASHBOARD_SCHEMA_INVALID", {
      operation,
      paths: [
        ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
      ]
        .join(",")
        .slice(0, 180),
    });
    throw new AppError({ code: "UNAVAILABLE" });
  }
  const { fila, alertas, ...rest } = parsed.data;
  return {
    ...rest,
    ...(fila && {
      fila: fila.map((item) => ({
        ...item,
        razao_social: maskName(item.razao_social),
        cnpj: maskCnpj(item.cnpj),
      })),
    }),
    ...(alertas && {
      alertas: alertas.map((alert) => ({
        ...alert,
        seller: {
          ...alert.seller,
          razao_social: maskName(alert.seller.razao_social),
          cnpj: maskCnpj(alert.seller.cnpj),
        },
      })),
    }),
  };
}

/** D-H2: hides Primeiros passos for good (an idempotent PUT, 204). */
export async function hideFirstSteps(): Promise<ApiResult<unknown>> {
  const token = await sessionToken();
  return panelRequest({
    operation: "first-steps-hide",
    path: apiPaths.panel.firstSteps(),
    method: "PUT",
    body: { oculto: true },
    schema: raw,
    ...(token !== undefined && { sessionToken: token }),
  });
}
