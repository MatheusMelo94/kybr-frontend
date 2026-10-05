import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingSkeleton } from "@/features/panel-onboarding/components/onboarding-skeleton";

describe("OnboardingSkeleton", () => {
  it("is static blocks hidden from assistive technology (no spinner)", () => {
    render(<OnboardingSkeleton />);

    const skeleton = screen.getByTestId("onboarding-skeleton");
    expect(
      skeleton.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThan(3);
    expect(skeleton.querySelector('[role="progressbar"]')).toBeNull();
  });
});
