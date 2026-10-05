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

  // Each tone's computed colours and bar: primitives.spec (Playwright).
});
