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

  describe("with the brand tokens (app/tokens.css)", () => {
    it("treats text-body/-secondary/-title as font sizes, not colors", () => {
      expect(cn("text-body", "text-ink")).toBe("text-body text-ink");
      expect(cn("text-secondary text-ink-muted", "text-title")).toBe(
        "text-ink-muted text-title",
      );
    });

    it("treats the brand v1 sizes (lead, h2, verdict, label, input) as font sizes too", () => {
      for (const size of ["lead", "h2", "verdict", "label", "input"])
        expect(cn(`text-${size}`, "text-ink")).toBe(`text-${size} text-ink`);
    });

    it("treats font-title/-body/-strong/-lead as font weights, not families", () => {
      expect(cn("font-sans", "font-title")).toBe("font-sans font-title");
      expect(cn("font-body", "font-strong")).toBe("font-strong");
    });

    it("merges the link container width with other max-widths", () => {
      expect(cn("max-w-link", "max-w-full")).toBe("max-w-full");
    });

    it("merges the motion easing tokens", () => {
      expect(cn("ease-out-quart", "ease-in-out-quart")).toBe(
        "ease-in-out-quart",
      );
    });
  });
});
