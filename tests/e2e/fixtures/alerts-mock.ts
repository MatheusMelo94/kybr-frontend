import type { APIRequestContext } from "@playwright/test";

import type { AlertPreset } from "../../fixtures/factories/panel.ts";
import { MOCK_API } from "./mock-api.ts";

// The alerts mock's per-test controls (T120, QA M7 G1/G2): every seed and
// fault is scoped to the test's own account.

const CONTROLS = `${MOCK_API}/__mock/panel`;

/** G1: replaces the account's alerts, their cases and D-M2 with a preset (creating the account if needed). */
export async function seedAlerts(
  request: APIRequestContext,
  email: string,
  preset: AlertPreset,
): Promise<{ id: string; tipo: string; case_id: string | null }[]> {
  const response = await request.post(`${CONTROLS}/alerts/seed`, {
    data: { email, preset },
  });
  if (response.status() !== 201)
    throw new Error(`seedAlerts: ${response.status()}`);
  return (await response.json()) as {
    id: string;
    tipo: string;
    case_id: string | null;
  }[];
}

/** PM6 / D-M3: the sweep finds a change; a critico one opens a case and mails it. */
export async function sweep(
  request: APIRequestContext,
  email: string,
  body: { cnpj: string; tipo: string },
): Promise<{ id: string; case_id: string | null }> {
  const response = await request.post(`${CONTROLS}/sweep`, {
    data: { email, ...body },
  });
  if (response.status() !== 201) throw new Error(`sweep: ${response.status()}`);
  return (await response.json()) as { id: string; case_id: string | null };
}

/** G2: a fault on D-M1 ("alerts") or D-M2 ("monitoring"); kind null clears it. */
export async function alertFault(
  request: APIRequestContext,
  email: string,
  endpoint: "alerts" | "monitoring",
  kind: "delay" | "500" | "503" | "drop" | null,
  extra: { ms?: number; times?: number } = {},
): Promise<void> {
  const response = await request.post(`${CONTROLS}/alert-fault`, {
    data: { email, endpoint, kind, ...extra },
  });
  if (response.status() !== 204)
    throw new Error(`alertFault: ${response.status()}`);
}

/** PM7: alertas-falha / monitoramento-falha for one account, on or off. */
export async function alertScenario(
  request: APIRequestContext,
  email: string,
  scenario: "alertas-falha" | "monitoramento-falha",
  on = true,
): Promise<void> {
  const response = await request.post(`${CONTROLS}/${on ? "seed" : "unseed"}`, {
    data: { scenario, email },
  });
  if (response.status() !== 204)
    throw new Error(`alertScenario: ${response.status()}`);
}

/** The mail.alert.* the sweep wrote for an account (subject + CTA link). */
export async function alertMail(
  request: APIRequestContext,
  email: string,
): Promise<{ assunto: string; link: string } | undefined> {
  const response = await request.get(
    `${CONTROLS}/outbox?to=${encodeURIComponent(email)}`,
  );
  if (!response.ok()) return undefined;
  return (
    (await response.json()) as { alerta?: { assunto: string; link: string } }
  ).alerta;
}
