import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select } from "@/components/panel/select";

function renderSelect(props: Partial<Parameters<typeof Select>[0]> = {}) {
  const onChange = vi.fn();
  const ref = createRef<HTMLSelectElement>();
  render(
    <Select
      label="Coluna do CNPJ"
      value="0"
      onChange={onChange}
      ref={ref}
      {...props}
    >
      <option value="0">CNPJ</option>
      <option value="1">Responsável</option>
    </Select>,
  );
  return {
    onChange,
    ref,
    select: screen.getByRole("combobox", { name: "Coluna do CNPJ" }),
  };
}

describe("Select (T76)", () => {
  it("is a native select with a visible label", () => {
    const { select } = renderSelect();
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByText("Coluna do CNPJ").tagName).toBe("LABEL");
    expect(select).toHaveValue("0");
  });

  it("reports the chosen value", () => {
    const { select, onChange } = renderSelect();
    fireEvent.change(select, { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("describes itself with the hint, then the error, and is invalid with an error", () => {
    const { select } = renderSelect({
      hint: "A coluna com os CNPJs.",
      error: "Não achamos a coluna de CNPJ. Escolha qual é.",
    });
    expect(select).toHaveAccessibleDescription(
      "A coluna com os CNPJs. Não achamos a coluna de CNPJ. Escolha qual é.",
    );
    expect(select).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid with no description by default", () => {
    const { select } = renderSelect();
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(select).not.toHaveAttribute("aria-describedby");
  });

  it("can be focused programmatically (the no-column state focuses it)", () => {
    const { select, ref } = renderSelect();
    ref.current?.focus();
    expect(select).toHaveFocus();
  });

  it("is ≥ 40 px, ≥ 44 px on coarse pointers, with the focus ring", () => {
    const { select } = renderSelect();
    expect(select).toHaveClass(
      "min-h-10",
      "pointer-coarse:min-h-11",
      "focus-visible:outline-2",
    );
  });
});
