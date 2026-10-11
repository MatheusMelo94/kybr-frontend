import { describe, expect, it } from "vitest";

import {
  AUDIT_MAX_MONTHS,
  auditRangeOk,
  defaultAuditRange,
} from "@/features/panel-sellers/audit-range";

// T142 (O-F5, G11): the audit export's de/ate, calendar days in São Paulo;
// the last 3 months by default, at most 12.

describe("audit range", () => {
  it("defaults to the last 3 months, ending today in São Paulo", () => {
    // 2026-10-06 02:30Z is still the 5th in São Paulo.
    expect(defaultAuditRange(new Date("2026-10-06T02:30:00Z"))).toEqual({
      de: "2026-07-05",
      ate: "2026-10-05",
    });
  });

  it("allows up to 12 months", () => {
    expect(AUDIT_MAX_MONTHS).toBe(12);
    expect(auditRangeOk("2025-10-05", "2026-10-05")).toBe(true);
    expect(auditRangeOk("2026-10-05", "2026-10-05")).toBe(true);
  });

  it.each([
    ["2025-10-04", "2026-10-05", "over 12 months"],
    ["2026-10-06", "2026-10-05", "ate before de"],
    ["2026-13-01", "2026-12-01", "no such month"],
    ["2026-02-30", "2026-03-01", "no such day"],
    ["05/10/2026", "2026-10-05", "not ISO"],
    ["", "2026-10-05", "empty"],
  ])("refuses %s..%s (%s)", (de, ate) => {
    expect(auditRangeOk(de, ate)).toBe(false);
  });
});
