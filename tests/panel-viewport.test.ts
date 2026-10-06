// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import * as linkLayout from "@/app/(link)/layout";
import { viewport as panelViewport } from "@/app/(panel)/painel/layout";
import { viewport as rootViewport } from "@/app/layout";

vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "", variable: "", style: {} }),
}));

// T112 (plan-m6 § 6): the sticky action bar needs safe-area insets, so the
// panel's own segment sets viewport-fit=cover. The root and /v/* don't.

describe("the panel viewport", () => {
  it("sets viewport-fit=cover and repeats the root's color scheme and theme colors (token sync)", () => {
    expect(panelViewport.viewportFit).toBe("cover");
    expect(panelViewport.colorScheme).toBe(rootViewport.colorScheme);
    expect(panelViewport.themeColor).toEqual(rootViewport.themeColor);
  });

  it("F14: never limits zoom (no maximumScale, no userScalable: false)", () => {
    expect(panelViewport).not.toHaveProperty("maximumScale");
    expect(panelViewport).not.toHaveProperty("userScalable");
  });

  it("the root viewport has no viewport-fit, and the link layout doesn't add one", () => {
    expect(rootViewport).not.toHaveProperty("viewportFit");
    expect(linkLayout).not.toHaveProperty("viewport");
  });
});
