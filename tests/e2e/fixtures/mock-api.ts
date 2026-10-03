import type { APIRequestContext, TestInfo } from "@playwright/test";

import type { CaseKind } from "../../fixtures/factories/seller-link.ts";

// Client for the HTTP mock API's per-test controls (QA test plan G1–G6).
// Every test owns its cases and slugs: never POST /__mock/reset here, since
// the four projects run fully in parallel against one mock.

export const MOCK_API = "http://localhost:4010"; // playwright.config.ts

export type CaseInput = {
  slug?: string;
  kind?: CaseKind;
  /** Backdates criado_em: the server's elapsed time for the 10 s switch. */
  ageMs?: number;
  estado?: "processing" | "pending" | "approved" | "blocked";
  resultado?: Record<string, unknown>;
  cnpj?: string;
  responsavel?: string;
};

/** A slug, a token suffix or any key that only this test (and project) uses. */
export function uniqueKey(prefix: string, testInfo: TestInfo): string {
  return `${prefix}-${testInfo.project.name}-${Math.random().toString(36).slice(2, 8)}`;
}

/** G1: a new case; a held, processing one ("retido") by default. */
export async function createCase(
  request: APIRequestContext,
  input: CaseInput = {},
): Promise<string> {
  const response = await request.post(`${MOCK_API}/__mock/cases`, {
    data: input,
  });
  if (response.status() !== 201)
    throw new Error(`createCase failed: ${response.status()}`);
  return ((await response.json()) as { token: string }).token;
}

/** G2: a new kind, or an explicit estado + resultado. */
export async function setCaseState(
  request: APIRequestContext,
  token: string,
  change: Pick<CaseInput, "kind" | "estado" | "resultado">,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/cases/${token}/state`, {
    data: change,
  });
}

/** G2: the case is gone (CASO_NAO_ENCONTRADO). */
export async function deleteCase(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  await request.delete(`${MOCK_API}/__mock/cases/${token}`);
}

/** G4: the next `times` reads of the case answer `status`. */
export async function failCaseReads(
  request: APIRequestContext,
  token: string,
  status: number,
  times = 1,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/cases/${token}/fail`, {
    data: { status, times },
  });
}

/** G5: every read of the case waits `ms`. */
export async function delayCaseReads(
  request: APIRequestContext,
  token: string,
  ms: number,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/cases/${token}/delay`, {
    data: { ms },
  });
}

/** G6: how many D4 reads this token string got. */
export async function caseReads(
  request: APIRequestContext,
  token: string,
): Promise<number> {
  const response = await request.get(`${MOCK_API}/__mock/cases/${token}/reads`);
  return ((await response.json()) as { reads: number }).reads;
}

/** D1, D2, D3 and D4 answer LINK_NAO_ENCONTRADO for this slug from now on. */
export async function disableLink(
  request: APIRequestContext,
  slug: string,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/links/${slug}/disable`);
}
