import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("is a hidden, token-colored placeholder block", () => {
    const { container } = render(<Skeleton className="h-12 w-full" />);
    const block = container.firstElementChild;

    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass(
      "bg-surface-raised",
      "rounded-lg",
      "h-12",
      "w-full",
    );
  });

  it("doesn't animate (functional-only motion: nothing else moves)", () => {
    const { container } = render(<Skeleton className="h-4" />);

    expect(container.firstElementChild?.className).not.toMatch(/animate-/);
  });
});
