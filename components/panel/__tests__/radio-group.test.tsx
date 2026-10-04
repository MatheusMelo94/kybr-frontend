import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { RadioGroup } from "@/components/panel/radio-group";

const OPTIONS = [
  { value: "a", label: "Lojas de peças", description: "Vendem peças." },
  { value: "b", label: "Oficinas e serviços" },
];

describe("RadioGroup", () => {
  it("is a fieldset named by its legend, with one labeled radio per option", () => {
    render(
      <RadioGroup
        name="categoria"
        legend="Que tipo de vendedor?"
        options={OPTIONS}
      />,
    );

    const group = screen.getByRole("radiogroup", {
      name: "Que tipo de vendedor?",
    });
    expect(group.tagName).toBe("FIELDSET");
    expect(
      within(group).getByRole("radio", { name: "Lojas de peças" }),
    ).toHaveAccessibleDescription("Vendem peças.");
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
  });

  it("wires the hint and error to every radio, and marks the group invalid", () => {
    render(
      <RadioGroup
        name="categoria"
        legend="Tipo"
        options={OPTIONS}
        hint="Dá para ajustar depois."
        error="Escolha um tipo de vendedor."
      />,
    );

    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      "Dá para ajustar depois. Escolha um tipo de vendedor.",
    );
    expect(
      screen.getByRole("radio", { name: "Oficinas e serviços" }),
    ).toHaveAccessibleDescription(
      "Dá para ajustar depois. Escolha um tipo de vendedor.",
    );
  });

  it("is controlled: value + onChange", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        name="categoria"
        legend="Tipo"
        options={OPTIONS}
        value="a"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: "Lojas de peças" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Oficinas e serviços" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("gives its ref to the checked radio, or the first, so a form can focus it", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <RadioGroup
        name="categoria"
        legend="Tipo"
        options={OPTIONS}
        value="b"
        onChange={() => {}}
        ref={ref}
      />,
    );

    expect(ref.current).toBe(
      screen.getByRole("radio", { name: "Oficinas e serviços" }),
    );
  });
});
