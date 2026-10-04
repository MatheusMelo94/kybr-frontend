import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseViewTransition } from "@/features/seller-link/components/case/case-view-transition";
import { VerifyingView } from "@/features/seller-link/components/case/verifying-view";
import { StepIndicator } from "@/features/seller-link/components/step-indicator";

// T33 (spec § Motion Intent, AC 32; tech-design § 5): CSS only. jsdom doesn't
// run CSS, so these pin the classes; motion.spec.ts checks the browser.

describe("motion (T33)", () => {
  it("verificando: an aria-hidden indeterminate bar, gone under reduced motion, with the status text kept", () => {
    const { container } = render(<VerifyingView />);

    const bar = container.querySelector('[data-motion="indeterminate"]');
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveClass("motion-reduce:hidden");
    expect(bar?.firstElementChild).toHaveClass("animate-indeterminate");
    expect(
      screen.getByText(
        "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
      ),
    ).toBeInTheDocument();
  });

  it("step indicator: only the current segment fills in (scale-x from 0), instantly under reduced motion", () => {
    const { container } = render(<StepIndicator step={2} />);
    const [first, current, next] = container.querySelectorAll("[data-segment]");

    expect(current).toHaveClass(
      "origin-left",
      "starting:scale-x-0",
      "transition-transform",
      "duration-(--duration-base)",
      "ease-out-quart",
      "motion-reduce:transition-none",
    );
    expect(first).not.toHaveClass("starting:scale-x-0");
    expect(next).not.toHaveClass("starting:scale-x-0");
  });

  it("view change: the new view fades in (opacity only), instantly under reduced motion; never on the first render", () => {
    const { container, rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="a">
        <h1 tabIndex={-1}>Verificando sua empresa</h1>
      </CaseViewTransition>,
    );
    const view = (): Element | null | undefined =>
      container.querySelector("h1")?.parentElement;
    expect(view()).not.toHaveClass("starting:opacity-0");

    act(() =>
      rerender(
        <CaseViewTransition viewKey="approved" announcement="b">
          <h1 tabIndex={-1}>Tudo certo, Maria.</h1>
        </CaseViewTransition>,
      ),
    );

    expect(view()).toHaveClass(
      "starting:opacity-0",
      "transition-opacity",
      "duration-(--duration-base)",
      "motion-reduce:transition-none",
    );
  });
});
