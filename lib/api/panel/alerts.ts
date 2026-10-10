import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  alertListSchema,
  monitoringSchema,
  type AlertList,
  type Monitoring,
} from "@/lib/api/schemas/panel/alerts";
import { maskCnpj } from "@/lib/cnpj";
import { reportMarker } from "@/lib/monitoring";

// The Monitoramento's data functions (D-M1, D-M2 + C-M7-1–5, Pre-Contract).
// Read-only: every call goes through the panel client (no-store forced, P06;
// the bearer from the DAL; the BFF key). Callers have already passed
// requireSession() (ADR-0011 Addendum 1); without a session token nothing is
// sent. Failures throw SESSAO_EXPIRADA (no session, or an API 401) or
// UNAVAILABLE (everything else: the page's error.tsx).

/** The body comes back raw: it's parsed here, so a failure logs shape only (F11). */
const raw = z.unknown();

async function read(path: string, operation: string): Promise<unknown> {
  const token = await sessionToken();
  if (token === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  const result = await panelRequest({
    operation,
    path,
    schema: raw,
    sessionToken: token,
  });
  if (result.ok) return result.data;
  if (result.error.code === "SESSAO_EXPIRADA") throw result.error;
  throw new AppError({
    code: "UNAVAILABLE",
    status: result.error.status,
    requestId: result.error.requestId,
  });
}

/**
 * Parses a response; a failure throws UNAVAILABLE and reports
 * ALERT_SCHEMA_INVALID with the operation and the failing paths, never
 * ZodError's message or the received values (M6 F11; A-F2: a `responsavel`
 * is a person's name). One bad alert fails the whole list (A-F4).
 */
function parse<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  reportMarker("ALERT_SCHEMA_INVALID", {
    operation,
    paths: [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ]
      .join(",")
      .slice(0, 180),
  });
  throw new AppError({ code: "UNAVAILABLE" });
}

/** D-M1: the newest 50 (C-M7-5), every CNPJ masked here so the wire form never reaches a prop (A-F1). */
export async function listAlerts(): Promise<AlertList> {
  const operation = "alerts-list";
  const list = parse(
    alertListSchema,
    await read(apiPaths.panel.alerts(), operation),
    operation,
  );
  return list.map((alert) => ({
    ...alert,
    seller: { ...alert.seller, cnpj: maskCnpj(alert.seller.cnpj) },
  }));
}

/** D-M2: the sweep status (C-M7-2). Never a poll: no X-Kybr-Poll. */
export async function getMonitoring(): Promise<Monitoring> {
  const operation = "monitoring";
  return parse(
    monitoringSchema,
    await read(apiPaths.panel.monitoring(), operation),
    operation,
  );
}
