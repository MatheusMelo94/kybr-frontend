import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Notice } from "@/components/panel/notice";

describe("Notice", () => {
  it("is a polite status banner by default", () => {
    render(<Notice>Você saiu do painel.</Notice>);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Você saiu do painel.");
    expect(notice).not.toHaveAttribute("tabindex");
  });

  it("is an alert when asked", () => {
    render(<Notice role="alert">Sua sessão expirou.</Notice>);

    expect(screen.getByRole("alert")).toHaveTextContent("Sua sessão expirou.");
  });

  it("can take focus (tabIndex -1) and exposes its element", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Notice focusable ref={ref}>
        Senha alterada.
      </Notice>,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("tabindex", "-1");
    ref.current?.focus();
    expect(notice).toHaveFocus();
  });

  // The colours: primitives.spec (Playwright).
  it.each(["warning", "danger"] as const)(
    "the %s tone is ink text with a coloured bar, never a signal text colour (DDR-0003)",
    (tone) => {
      render(<Notice tone={tone}>Texto</Notice>);
      const notice = screen.getByRole("status");

      expect(notice.className).toMatch(new RegExp(`border-l-${tone}\\b`));
      expect(notice.className).not.toMatch(/text-(warning|danger)/);
    },
  );

  it("the info tone has no bar", () => {
    render(<Notice>Texto</Notice>);
    expect(screen.getByRole("status").className).not.toMatch(/border-l-/);
  });

});
