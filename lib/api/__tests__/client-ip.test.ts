// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientIp, parseClientIp } from "@/lib/api/client-ip";

// vitest.config.mts: CLIENT_IP_HEADER=x-forwarded-for, CLIENT_IP_TRUSTED_HOPS=1.
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseClientIp: list-valued header (x-forwarded-for)", () => {
  it.each([
    ["203.0.113.7", 1, "203.0.113.7"],
    [" 203.0.113.7 ", 1, "203.0.113.7"],
    // The client writes the left entries; each trusted proxy appends one on the right.
    ["198.51.100.1, 203.0.113.7", 1, "203.0.113.7"],
    ["198.51.100.1, 203.0.113.7", 2, "198.51.100.1"],
    ["192.0.2.9, 198.51.100.1, 203.0.113.7", 2, "198.51.100.1"],
    ["2001:db8::1", 1, "2001:db8::1"],
  ] as const)("reads %j with %i trusted hop(s) as %j", (value, hops, ip) => {
    expect(
      parseClientIp(value, { listValued: true, trustedHops: hops }),
    ).toEqual({
      ok: true,
      ip,
    });
  });

  it.each([
    ["203.0.113.7:51234", "203.0.113.7"],
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["198.51.100.1, 203.0.113.7:8080", "203.0.113.7"],
  ])("strips the port from %j", (value, ip) => {
    expect(parseClientIp(value, { listValued: true, trustedHops: 1 })).toEqual({
      ok: true,
      ip,
    });
  });

  it.each([
    [null, 1, "missing"],
    ["", 1, "missing"],
    ["203.0.113.7", 2, "too_few_entries"],
    ["unknown", 1, "not_an_ip"],
    ["203.0.113.7, not-an-ip", 1, "not_an_ip"],
    ["<script>", 1, "not_an_ip"],
  ] as const)(
    "derives nothing from %j with %i trusted hop(s) (%s)",
    (value, hops, reason) => {
      expect(
        parseClientIp(value, { listValued: true, trustedHops: hops }),
      ).toEqual({ ok: false, reason });
    },
  );
});

describe("parseClientIp: single-value platform header", () => {
  it("reads the one value", () => {
    expect(parseClientIp("203.0.113.7", { listValued: false })).toEqual({
      ok: true,
      ip: "203.0.113.7",
    });
  });

  it("refuses a list: a platform header never carries one", () => {
    expect(
      parseClientIp("198.51.100.1, 203.0.113.7", { listValued: false }),
    ).toEqual({
      ok: false,
      reason: "not_single_value",
    });
  });
});

describe("getClientIp", () => {
  it("reads the configured header with the configured hops", async () => {
    requestHeaders.value = new Headers({
      "x-forwarded-for": "198.51.100.1, 203.0.113.7",
    });

    expect(await getClientIp()).toBe("203.0.113.7");
  });

  it("returns undefined and logs a shape-only counter when no IP can be derived", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    requestHeaders.value = new Headers({
      "x-forwarded-for": "secret-looking-garbage",
    });

    expect(await getClientIp()).toBeUndefined();
    expect(await getClientIp()).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    const [message, details] = warn.mock.calls[1] ?? [];
    expect(message).toBe("[kybr-api] client ip not derived");
    expect(details).toMatchObject({
      header: "x-forwarded-for",
      reason: "not_an_ip",
      count: expect.any(Number),
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "secret-looking-garbage",
    );
  });
});
