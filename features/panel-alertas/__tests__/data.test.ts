// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";

const api = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getMonitoring: vi.fn(),
}));
vi.mock("@/lib/api/panel/alerts", () => api);
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/api/panel/session", () => ({
  sessionExpiredUrl: async () => "/entrar?motivo=sessao&volta=%2Fmonitoramento",
}));

import { loadMonitoramento } from "@/features/panel-alertas/data";

const ALERT = { id: "a".repeat(16) };
const MON = {
  ativo: true,
  monitorados: 3,
  proxima_varredura: "2026-10-12T09:00:00Z",
};
const failure = (code: "UNAVAILABLE" | "SESSAO_EXPIRADA") =>
  Promise.reject(new AppError({ code }));

beforeEach(() => {
  api.listAlerts.mockReset();
  api.getMonitoring.mockReset();
  redirect.mockClear();
});

describe("loadMonitoramento (plan-m7 § 3)", () => {
  it("no alerts: the empty state picked from D-M2 (AC 49)", async () => {
    api.listAlerts.mockResolvedValue([]);
    api.getMonitoring.mockResolvedValue(MON);
    expect((await loadMonitoramento()).state).toEqual({
      kind: "nosweep",
      data: MON.proxima_varredura,
    });
  });

  it("both reads succeed", async () => {
    api.listAlerts.mockResolvedValue([ALERT]);
    api.getMonitoring.mockResolvedValue(MON);
    await expect(loadMonitoramento()).resolves.toEqual({
      alerts: [ALERT],
      monitoring: MON,
      state: { kind: "success" },
    });
  });

  it("G4: D-M2 failed with alerts → the alerts, no monitoring (the pill hides)", async () => {
    api.listAlerts.mockResolvedValue([ALERT]);
    api.getMonitoring.mockReturnValue(failure("UNAVAILABLE"));
    await expect(loadMonitoramento()).resolves.toEqual({
      alerts: [ALERT],
      monitoring: undefined,
      state: { kind: "success" },
    });
  });

  it("Q3: D-M2 failed with no alerts → error.tsx (the empty states need it)", async () => {
    api.listAlerts.mockResolvedValue([]);
    api.getMonitoring.mockReturnValue(failure("UNAVAILABLE"));
    await expect(loadMonitoramento()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("D-M1 failed → error.tsx", async () => {
    api.listAlerts.mockReturnValue(failure("UNAVAILABLE"));
    api.getMonitoring.mockResolvedValue(MON);
    await expect(loadMonitoramento()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it.each([
    ["alerts", () => api.listAlerts, () => api.getMonitoring],
    ["monitoring", () => api.getMonitoring, () => api.listAlerts],
  ])("an expired session on %s → /entrar", async (_, expired, other) => {
    expired().mockReturnValue(failure("SESSAO_EXPIRADA"));
    other().mockResolvedValue([ALERT]);
    await expect(loadMonitoramento()).rejects.toThrow(
      "redirect /entrar?motivo=sessao&volta=%2Fmonitoramento",
    );
  });
});
