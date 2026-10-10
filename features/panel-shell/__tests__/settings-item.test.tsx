import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsItem } from "@/features/panel-shell/components/settings-item";

// T135: the account menu's "Configurações" opens /configuracoes.

describe("SettingsItem (T135)", () => {
  it("is a menu item linking to /configuracoes", () => {
    render(<SettingsItem />);
    expect(
      screen.getByRole("menuitem", { name: "Configurações" }),
    ).toHaveAttribute("href", "/configuracoes");
  });
});
