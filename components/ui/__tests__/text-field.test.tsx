import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextField } from "@/components/ui/text-field";

describe("TextField", () => {
  it("binds a visible label to the input", () => {
    render(<TextField label="CNPJ da empresa" name="cnpj" />);

    const input = screen.getByLabelText("CNPJ da empresa");
    expect(input.tagName).toBe("INPUT");
    expect(screen.getByText("CNPJ da empresa").tagName).toBe("LABEL");
  });

  it("keeps the label as the accessible name when a placeholder is set", () => {
    render(
      <TextField
        label="CNPJ da empresa"
        name="cnpj"
        placeholder="00.000.000/0000-00"
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "CNPJ da empresa" }),
    ).toHaveAttribute("placeholder", "00.000.000/0000-00");
  });

  it("describes the input with its hint", () => {
    render(
      <TextField
        label="Nome completo do responsável"
        name="responsavel"
        hint="Nome e sobrenome de quem está fazendo o cadastro."
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Nome completo do responsável",
    });
    expect(input).toHaveAccessibleDescription(
      "Nome e sobrenome de quem está fazendo o cadastro.",
    );
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the input invalid and links the error after the hint", () => {
    render(
      <TextField
        label="Nome completo do responsável"
        name="responsavel"
        hint="Nome e sobrenome de quem está fazendo o cadastro."
        error="Escreva nome e sobrenome."
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Nome completo do responsável",
    });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Nome e sobrenome de quem está fazendo o cadastro. Escreva nome e sobrenome.",
    );
  });

  it("links an error even without a hint", () => {
    render(
      <TextField
        label="CNPJ da empresa"
        name="cnpj"
        error="CNPJ inválido. Confira os números."
      />,
    );

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "CNPJ inválido. Confira os números.",
    );
  });

  it("uses 16 px input text, so iOS doesn't zoom on focus", () => {
    render(<TextField label="CNPJ da empresa" name="cnpj" />);

    expect(screen.getByRole("textbox")).toHaveClass("text-base");
  });

  it("forwards its ref to the input, so a form can focus the first invalid field", () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextField ref={ref} label="CNPJ da empresa" name="cnpj" />);

    ref.current?.focus();

    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("passes the input attributes through and reports changes", () => {
    const onChange = vi.fn();
    render(
      <TextField
        label="Seu e-mail para avisos"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value=""
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Seu e-mail para avisos",
    });
    fireEvent.change(input, { target: { value: "nome@empresa.test" } });

    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("inputmode", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).toHaveAttribute("name", "email");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("gives two fields distinct ids", () => {
    render(
      <>
        <TextField label="CNPJ da empresa" name="cnpj" hint="a" />
        <TextField
          label="Nome completo do responsável"
          name="responsavel"
          hint="b"
        />
      </>,
    );

    expect(
      screen.getByLabelText("CNPJ da empresa"),
    ).toHaveAccessibleDescription("a");
    expect(
      screen.getByLabelText("Nome completo do responsável"),
    ).toHaveAccessibleDescription("b");
  });
});
