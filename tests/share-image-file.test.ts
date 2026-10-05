// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Brand v1 B3 / review B-002: the panel's share image is a static
// 1200 × 630 PNG, small enough for every link preview.

const png = readFileSync("public/brand/kybr-og-1200x630.png");

describe("the share image file", () => {
  it("is a 1200 × 630 PNG", () => {
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("weighs at most 60 kB", () => {
    expect(png.length).toBeLessThanOrEqual(60 * 1024);
  });
});
