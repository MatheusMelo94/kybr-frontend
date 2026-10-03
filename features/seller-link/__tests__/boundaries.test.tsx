import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormSkeleton } from "@/features/seller-link/components/form-skeleton";
import { LinkNotFound } from "@/features/seller-link/components/link-not-found";
import { LoadError } from "@/features/seller-link/components/load-error";

describe("LinkNotFound", () => {
  it("explains the dead link with notfound.* and one h1, with no form", () => {
    const { container } = render(<LinkNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este link de cadastro não existe ou foi desativado. Peça o link certo à plataforma onde você está se cadastrando.",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("form, input")).toBeNull();
    expect(container.textContent).not.toMatch(/kybr/i);
  });
});

describe("LoadError", () => {
  it("shows loaderror.* and retries with Tentar de novo", () => {
    const onRetry = vi.fn();
    render(<LoadError onRetry={onRetry} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Não conseguimos abrir o cadastro",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Confira sua conexão e tente de novo."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("FormSkeleton", () => {
  it("is hidden from assistive technology and marks the region busy", () => {
    const { container } = render(<FormSkeleton />);
    const root = container.firstElementChild;

    expect(root).toHaveAttribute("aria-busy", "true");
    expect(
      container.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("sketches the form: name line, step indicator, title, lead, two fields and the button", () => {
    const { container } = render(<FormSkeleton />);

    // Same heights as the form: proven by the CLS = 0 check in
    // tests/e2e/seller-link/form-boundaries.spec.ts.
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(6);
  });
});
