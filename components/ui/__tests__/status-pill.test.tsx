import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusPill } from "@/components/ui/status-pill";

// Brand v1 B7 (DDR-0003): a signal colour appears as a dot, with ink text
// next to it; never as a text colour or a filled pill.

describe("StatusPill", () => {
  it.each(["success", "warning", "danger", "monitor", "neutral"] as const)(
    "%s: the word carries the meaning, the dot is decorative",
    (tone) => {
      const { container } = render(
        <StatusPill tone={tone}>Encontrado</StatusPill>,
      );

      expect(screen.getByText("Encontrado")).toBeVisible();
      const dot = container.querySelector('[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot).toBeEmptyDOMElement();
      expect(container.textContent).toBe("Encontrado");
    },
  );

  // Ink words, signal dot: brand.spec (computed) and the source scan.
});
