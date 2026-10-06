import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextArea } from "@/components/panel/text-area";

describe("TextArea (panel primitive: the dialogs' note)", () => {
  it("a visible label names it; the hint describes it", () => {
    render(
      <TextArea label="Mensagem" name="nota" hint="Até 280 caracteres." />,
    );
    const field = screen.getByRole("textbox", { name: "Mensagem" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAccessibleDescription("Até 280 caracteres.");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("an error marks it invalid and joins the description after the hint", () => {
    render(
      <TextArea label="Mensagem" name="nota" hint="Dica." error="Erro." />,
    );
    const field = screen.getByRole("textbox", { name: "Mensagem" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Dica. Erro.");
  });

  it("is controlled, with maxLength and disabled passed through", () => {
    const onChange = vi.fn();
    render(
      <TextArea
        label="Mensagem"
        name="nota"
        value="oi"
        onChange={onChange}
        maxLength={280}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Mensagem" });
    expect(field).toHaveValue("oi");
    expect(field).toHaveAttribute("maxLength", "280");
    fireEvent.change(field, { target: { value: "olá" } });
    expect(onChange).toHaveBeenCalledWith("olá");
  });

  it("disabled", () => {
    render(<TextArea label="Mensagem" name="nota" disabled />);
    expect(screen.getByRole("textbox", { name: "Mensagem" })).toBeDisabled();
  });
});
