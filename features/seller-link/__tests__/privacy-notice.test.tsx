import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrivacyNotice } from "@/features/seller-link/components/privacy-notice";
import type { PublicLink } from "@/lib/api/schemas/public-link";
import type { SafeHttpsUrl } from "@/lib/safe-url";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));

const EMAIL_LINK: PublicLink = {
  nome: "Loja Exemplo",
  contato_vendedor: { tipo: "email", valor: "vendedores@loja-exemplo.test" },
};
const URL_LINK: PublicLink = {
  nome: "Outra Loja",
  contato_vendedor: {
    tipo: "url",
    valor: "https://outra-loja.test/ajuda" as SafeHttpsUrl,
  },
};

describe("PrivacyNotice (AC 31)", () => {
  it("one h1, a section heading per topic, and the marketplace's name filled in", () => {
    render(<PrivacyNotice slug="loja-exemplo" link={EMAIL_LINK} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Como tratamos seus dados",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Quem é responsável",
      "O que usamos",
      "Para quê",
      "Por quanto tempo",
      "Seus direitos",
    ]);
    expect(
      screen.getByText(
        "Loja Exemplo decide como seus dados são usados neste cadastro (controladora). A Kybr faz a verificação em nome de Loja Exemplo (operadora).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Para ver, corrigir ou apagar seus dados, fale com Loja Exemplo.",
      ),
    ).toBeInTheDocument();
  });

  it("an e-mail contact opens the mail app; a URL contact opens a new tab", () => {
    const { unmount } = render(
      <PrivacyNotice slug="loja-exemplo" link={EMAIL_LINK} />,
    );
    expect(
      screen.getByRole("link", { name: "Falar com Loja Exemplo" }),
    ).toHaveAttribute("href", "mailto:vendedores@loja-exemplo.test");
    unmount();

    render(<PrivacyNotice slug="outra-loja" link={URL_LINK} />);
    const contact = screen.getByRole("link", {
      name: "Falar com Outra Loja (abre em outra aba)",
    });
    expect(contact).toHaveAttribute("href", "https://outra-loja.test/ajuda");
    expect(contact).toHaveAttribute("target", "_blank");
  });

  it("partial (link info failed): the three fallbacks, no lower-case sentence start, no contact", () => {
    const { container } = render(
      <PrivacyNotice slug="loja-instavel" link={null} />,
    );

    expect(
      screen.getByText(/^Quem decide como seus dados são usados/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enquanto a plataforma usar o serviço\.$/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /fale com a plataforma onde você está se cadastrando\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Falar com/ })).toBeNull();
    for (const paragraph of container.querySelectorAll("p"))
      expect(paragraph.textContent).toMatch(/^\p{Lu}/u);
    expect(container).not.toHaveTextContent("{marketplace}");
  });

  it("ends with Voltar ao cadastro, to this link's form", () => {
    render(<PrivacyNotice slug="loja-exemplo" link={EMAIL_LINK} />);

    expect(
      screen.getByRole("link", { name: "Voltar ao cadastro" }),
    ).toHaveAttribute("href", "/v/loja-exemplo");
  });
});
