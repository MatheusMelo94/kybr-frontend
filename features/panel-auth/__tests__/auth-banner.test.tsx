import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthBanner } from "@/features/panel-auth/components/auth-banner";

describe("AuthBanner (plan § 2.8: read on load)", () => {
  it.each([
    [
      "sessao",
      ["Sua sessão expirou. Entre de novo para continuar de onde parou."],
    ],
    [
      "sessao-perdido",
      [
        "Sua sessão expirou. Entre de novo para continuar de onde parou.",
        "O que estava aberto num formulário não foi salvo.",
      ],
    ],
    ["saiu", ["Você saiu do painel."]],
    ["senha-nova", ["Senha alterada. Entre com a senha nova."]],
  ] as const)("%s shows its copy as a focused status", (kind, texts) => {
    render(<AuthBanner kind={kind} />);

    const banner = screen.getByRole("status");
    for (const text of texts) expect(banner).toHaveTextContent(text);
    expect(banner).toHaveFocus();
  });
});
