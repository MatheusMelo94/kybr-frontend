// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
const reportMarker = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { assertPanelHost } from "@/lib/api/panel/host";

beforeEach(() => {
  reportMarker.mockClear();
  notFound.mockClear();
});

describe("assertPanelHost (ADR-0008 rule 8, P03.2)", () => {
  it.each(["app.kybr.test", "APP.kybr.test"])(
    "passes on the panel host (%s)",
    async (host) => {
      requestHeaders.value = new Headers({ host });

      await expect(assertPanelHost()).resolves.toBeUndefined();
      expect(reportMarker).not.toHaveBeenCalled();
    },
  );

  it.each(["kybr.test", "evil.example", "app.kybr.test:8080", ""])(
    "answers notFound() with a PANEL_HOST_MISMATCH marker on %j",
    async (host) => {
      requestHeaders.value = new Headers(host ? { host } : {});

      await expect(assertPanelHost()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
      expect(reportMarker).toHaveBeenCalledWith("PANEL_HOST_MISMATCH", {});
    },
  );
});
