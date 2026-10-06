import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, useState, type JSX } from "react";
import { describe, expect, it, vi } from "vitest";

import { CheckboxGroup } from "@/components/panel/checkbox-group";

const OPTIONS = [
  { value: "a", label: "Cartão CNPJ" },
  { value: "b", label: "Comprovante de endereço" },
  { value: "c", label: "Contrato social" },
];

function Controlled({
  onChange,
}: {
  onChange: (values: string[]) => void;
}): JSX.Element {
  const [values, setValues] = useState<string[]>([]);
  return (
    <CheckboxGroup
      legend="Quais documentos?"
      name="tipos"
      options={OPTIONS}
      values={values}
      onChange={(next) => {
        setValues(next);
        onChange(next);
      }}
    />
  );
}

describe("CheckboxGroup", () => {
  it("is a fieldset named by its legend, with one labeled checkbox per option", () => {
    render(
      <CheckboxGroup
        legend="Quais documentos?"
        name="tipos"
        options={OPTIONS}
        values={[]}
      />,
    );
    const group = screen.getByRole("group", { name: "Quais documentos?" });
    expect(group.tagName).toBe("FIELDSET");
    expect(within(group).getAllByRole("checkbox")).toHaveLength(3);
    expect(
      within(group).getByRole("checkbox", { name: "Cartão CNPJ" }),
    ).not.toBeChecked();
  });

  it("reports the checked values in the options' order", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Contrato social" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cartão CNPJ" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "c"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Contrato social" }));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
  });

  it("an error marks each checkbox invalid and describes it (the focus target too), and the ref lands on the first checkbox", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <CheckboxGroup
        ref={ref}
        legend="Quais documentos?"
        name="tipos"
        options={OPTIONS}
        values={[]}
        error="Escolha pelo menos um documento."
      />,
    );
    const group = screen.getByRole("group", { name: "Quais documentos?" });
    // aria-invalid isn't supported on a group: it sits on the checkboxes.
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(group).toHaveAccessibleDescription(
      "Escolha pelo menos um documento.",
    );
    for (const box of within(group).getAllByRole("checkbox")) {
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(box).toHaveAccessibleDescription(
        "Escolha pelo menos um documento.",
      );
    }
    expect(ref.current).toBe(
      screen.getByRole("checkbox", { name: "Cartão CNPJ" }),
    );
  });

  it("without an error, the checkboxes carry no description and aren't invalid", () => {
    render(
      <CheckboxGroup
        legend="Quais documentos?"
        name="tipos"
        options={OPTIONS}
        values={[]}
      />,
    );
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box).not.toHaveAttribute("aria-describedby");
    }
  });
});
