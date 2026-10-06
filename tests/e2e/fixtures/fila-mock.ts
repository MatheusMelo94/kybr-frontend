import type { APIRequestContext } from "@playwright/test";

import type { CasePreset } from "../../fixtures/factories/panel.ts";
import { MOCK_API } from "./mock-api.ts";

// The cases mock's per-test controls (T92, QA G1/G2/G4): every seed and
// fault is scoped to the test's own account.

const CONTROLS = `${MOCK_API}/__mock/panel`;

export type MockCase = {
  id: string;
  kind: string;
  estado: string;
  origem: string;
  razao_social: string | null;
  verification_id: string;
  documentos: string[];
};

/** G1: replaces the account's cases with a preset (creating the account if needed). */
export async function seedCases(
  request: APIRequestContext,
  email: string,
  preset: CasePreset,
): Promise<MockCase[]> {
  const response = await request.post(`${CONTROLS}/cases/seed`, {
    data: { email, preset },
  });
  if (response.status() !== 201)
    throw new Error(`seedCases: ${response.status()}`);
  return (await response.json()) as MockCase[];
}

/** The account's cases, oldest SLA first. */
export async function casesFor(
  request: APIRequestContext,
  email: string,
): Promise<MockCase[]> {
  return (await (
    await request.get(`${CONTROLS}/cases?email=${encodeURIComponent(email)}`)
  ).json()) as MockCase[];
}

/** G2: a per-account fault on one case endpoint ("none" clears it). */
export async function caseFault(
  request: APIRequestContext,
  email: string,
  endpoint: string,
  fault: string,
  options: { ms?: number; times?: number } = {},
): Promise<void> {
  const response = await request.post(`${CONTROLS}/case-fault`, {
    data: { email, endpoint, fault, ...options },
  });
  if (response.status() !== 204)
    throw new Error(`caseFault: ${response.status()}`);
}

/** T92's named seeds (decide-falha, lista-falha, …), per account. */
export async function caseSeed(
  request: APIRequestContext,
  email: string,
  seed: string,
  options: { n?: number; ms?: number } = {},
): Promise<void> {
  const response = await request.post(`${CONTROLS}/case-seed`, {
    data: { email, seed, ...options },
  });
  if (response.status() !== 204)
    throw new Error(`caseSeed: ${response.status()}`);
}
