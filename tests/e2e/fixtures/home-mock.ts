import type { APIRequestContext } from "@playwright/test";

import type { HomePreset } from "../../fixtures/factories/panel.ts";
import { MOCK_API } from "./mock-api.ts";

// The Início / settings mock's per-test controls (T129, QA M8 G1/G2/G7):
// every seed and fault is scoped to the test's own account.

const CONTROLS = `${MOCK_API}/__mock/panel`;

/** G1: seeds the account's dashboard (creating the account if needed). */
export async function seedDashboard(
  request: APIRequestContext,
  email: string,
  preset: HomePreset,
): Promise<void> {
  const response = await request.post(`${CONTROLS}/dashboard/seed`, {
    data: { email, preset },
  });
  if (response.status() !== 201)
    throw new Error(`seedDashboard: ${response.status()}`);
}

type Fault = {
  kind: "delay" | "500" | "503" | "drop" | "omit" | null;
  ms?: number;
  times?: number;
  sem?: string[];
};

/** G2 / PH3 / PH4: a D-H1 fault for one account (kind null clears it). */
export async function dashboardFault(
  request: APIRequestContext,
  email: string,
  fault: Fault,
): Promise<void> {
  const response = await request.post(`${CONTROLS}/dashboard/fault`, {
    data: { email, ...fault },
  });
  if (response.status() !== 204)
    throw new Error(`dashboardFault: ${response.status()}`);
}

/** G2: a fault on D-H2, the settings PUTs or D-A6 for one account. */
export async function settingsFault(
  request: APIRequestContext,
  email: string,
  endpoint: "first-steps" | "workspace-put" | "me-put" | "password",
  fault: Omit<Fault, "sem">,
): Promise<void> {
  const response = await request.post(`${CONTROLS}/settings-fault`, {
    data: { email, endpoint, ...fault },
  });
  if (response.status() !== 204)
    throw new Error(`settingsFault: ${response.status()}`);
}
