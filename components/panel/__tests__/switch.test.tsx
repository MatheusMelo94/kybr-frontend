import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "@/components/panel/switch";

// T144 (spec § Accessibility Acceptance › Toggles; plan-m8 § 5): a switch
// named by its visible label, aria-checked, a ≥ 44 px target on coarse
// pointers, the thumb at --duration-fast and instant under reduced motion.

describe("Switch", () => {
  it("role=switch named by its visible label, with aria-checked", () => {
    render(
      <Switch label="Cartão CNPJ atualizado" checked onChange={vi.fn()} />,
    );
    const toggle = screen.getByRole("switch", {
      name: "Cartão CNPJ atualizado",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Cartão CNPJ atualizado")).toBeVisible();
  });

  it("a click (or Space/Enter, a native button) flips it", () => {
    const onChange = vi.fn();
    render(<Switch label="Procuração" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Procuração" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("a 44 px target on coarse pointers; the thumb at --duration-fast, none under reduced motion", () => {
    render(<Switch label="Procuração" checked={false} onChange={vi.fn()} />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("pointer-coarse:min-h-11");
    const thumb = toggle.querySelector("[data-switch-thumb]");
    expect(thumb?.className).toContain("duration-(--duration-fast)");
    expect(thumb?.className).toContain("motion-reduce:transition-none");
  });

  it("describedBy joins the error ids", () => {
    render(
      <Switch
        label="Procuração"
        checked={false}
        onChange={vi.fn()}
        describedBy="erro-docs"
      />,
    );
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-describedby",
      "erro-docs",
    );
  });
});
