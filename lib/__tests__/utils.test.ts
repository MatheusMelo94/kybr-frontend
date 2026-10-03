import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class values and drops falsy ones", () => {
    expect(
      cn("px-2", false, undefined, null, "", { "py-1": true, "m-4": false }),
    ).toBe("px-2 py-1");
  });

  it("lets the later class win when Tailwind utilities conflict", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("keeps non-conflicting utilities from both sides", () => {
    expect(cn("rounded-lg", ["text-sm", "font-bold"])).toBe(
      "rounded-lg text-sm font-bold",
    );
  });
});
