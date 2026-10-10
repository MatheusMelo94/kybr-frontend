import type { APIRequestContext } from "@playwright/test";

import { MOCK_API } from "./mock-api";

// The M8b mock's controls (T138, QA G1–G3, G6, G9), per account.

const CONTROLS = `${MOCK_API}/__mock/panel`;

export type SellerNeedle = {
  id: string;
  n: number;
  cnpj: string;
  status: string;
  case_aberto_id?: string;
};

/** QA G1: PS1 (120 sellers) or none, into the test's own account. */
export async function seedSellers(
  request: APIRequestContext,
  email: string,
  preset: "ps1" | "vazio" = "ps1",
): Promise<void> {
  const response = await request.post(`${CONTROLS}/sellers/seed`, {
    data: { email, preset },
  });
  if (response.status() !== 201) throw new Error("sellers seed refused");
}

/** The account's sellers as the mock holds them (wire CNPJs: test needles only). */
export async function sellerNeedles(
  request: APIRequestContext,
  email: string,
): Promise<SellerNeedle[]> {
  const response = await request.get(
    `${CONTROLS}/sellers?email=${encodeURIComponent(email)}`,
  );
  return (await response.json()) as SellerNeedle[];
}

/** QA G2 / G3: a per-account fault on an M8b endpoint (kind null clears it). */
export async function sellersFault(
  request: APIRequestContext,
  email: string,
  endpoint:
    | "sellers"
    | "seller"
    | "reverify"
    | "sellers-csv"
    | "audit-csv"
    | "policy-get"
    | "policy-put",
  kind:
    | "delay"
    | "500"
    | "503"
    | "drop"
    | "csv-exato"
    | "csv-grande"
    | "csv-html"
    | null,
  extra: { ms?: number; times?: number } = {},
): Promise<void> {
  await request.post(`${CONTROLS}/sellers/fault`, {
    data: { email, endpoint, kind, ...extra },
  });
}
