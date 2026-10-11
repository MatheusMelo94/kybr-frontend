import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsSkeleton } from "@/features/panel-settings/components/settings-skeleton";

describe("SettingsSkeleton (T135)", () => {
  it("is static blocks hidden from assistive technology (no spinner)", () => {
    render(<SettingsSkeleton />);
    const skeleton = screen.getByTestId("settings-skeleton");
    expect(
      skeleton.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThan(3);
    expect(skeleton.querySelector('[role="progressbar"]')).toBeNull();
  });
});
