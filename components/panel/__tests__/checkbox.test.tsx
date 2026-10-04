import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@/components/panel/checkbox";

describe("Checkbox", () => {
  it("is labeled by its visible label, which can hold links", () => {
    render(
      <Checkbox
        name="aceite"
        label={
          <>
            Li e aceito os <a href="https://example.invalid/t">Termos de uso</a>
            .
          </>
        }
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: /Li e aceito os Termos de uso/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Termos de uso" }),
    ).toBeInTheDocument();
  });

  it("wires the hint and error to aria-describedby, and the error to aria-invalid", () => {
    render(
      <Checkbox
        name="aceite"
        label="Aceito"
        hint="Obrigatório."
        error="Aceite os termos."
      />,
    );

    const box = screen.getByRole("checkbox");
    expect(box).toHaveAccessibleDescription("Obrigatório. Aceite os termos.");
    expect(box).toHaveAttribute("aria-invalid", "true");
  });

  it("isn't invalid without an error", () => {
    render(<Checkbox name="aceite" label="Aceito" />);

    expect(screen.getByRole("checkbox")).not.toHaveAttribute("aria-invalid");
  });

  it("is controlled: checked + onChange", () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        name="aceite"
        label="Aceito"
        checked={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // Accent, focus ring, the invalid outline and the 24 px / 44 px geometry:
  // primitives.spec (Playwright).
  it("can be disabled", () => {
    render(<Checkbox name="aceite" label="Aceito" error="Erro" disabled />);

    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("forwards its ref, so a form can focus it", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox name="aceite" label="Aceito" ref={ref} />);

    ref.current?.focus();
    expect(screen.getByRole("checkbox")).toHaveFocus();
  });
});
