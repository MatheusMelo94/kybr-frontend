import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDot } from "@/components/ui/status-dot";

describe("StatusDot", () => {
  it("is decorative: hidden from assistive technology, with no text", () => {
    const { container } = render(<StatusDot tone="success" />);
    const dot = container.firstElementChild;

    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toBeEmptyDOMElement();
    expect(dot).toHaveClass("rounded-full");
  });

  it.each([
    ["success", "bg-success"],
    ["warning", "bg-warning"],
    ["danger", "bg-danger"],
    ["monitor", "bg-monitor"],
    ["neutral", "bg-ink-muted"],
  ] as const)("uses the %s token color", (tone, token) => {
    // The dot's colour token is its contract (DDR-0003: signal as a dot).
    const { container } = render(<StatusDot tone={tone} />);

    expect(container.firstElementChild).toHaveClass(token);
  });
});
