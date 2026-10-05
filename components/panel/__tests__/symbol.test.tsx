import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KybrSymbol } from "@/components/panel/symbol";

// Brand v1 B4 (identity.md › Symbol, Minimum sizes): below 64 px the "k"
// without the dot; from 64 px "k." with it.

describe("KybrSymbol", () => {
  it("is an image named Kybr at its size, never focusable", () => {
    render(<KybrSymbol size={32} />);

    const mark = screen.getByRole("img", { name: "Kybr" });
    expect(mark).toHaveAttribute("width", "32");
    expect(mark).toHaveAttribute("height", "32");
    expect(mark).toHaveAttribute("focusable", "false");
  });

  it("drops the dot below 64 px", () => {
    const { container } = render(<KybrSymbol size={32} />);
    expect(container.querySelector("circle")).toBeNull();
  });

  it("keeps the dot from 64 px", () => {
    const { container } = render(<KybrSymbol size={64} />);
    expect(container.querySelector("circle")).not.toBeNull();
  });

  it("is a tile with a 25 % radius", () => {
    const { container } = render(<KybrSymbol size={48} />);
    expect(container.querySelector("rect")).toHaveAttribute("rx", "256");
  });
});
