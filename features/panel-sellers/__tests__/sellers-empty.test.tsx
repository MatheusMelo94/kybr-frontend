import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { SellersEmpty } from "@/features/panel-sellers/components/sellers-empty";

// T140 (AC 55): nobody yet, or nothing for this search / filter.

describe("SellersEmpty", () => {
  it("nobody yet: sellers.empty.* + Copiar link de cadastro (primary) + Verificar em lote", () => {
    render(
      <ToastProvider closeLabel="Fechar">
        <SellersEmpty
          search={{ pagina: 1 }}
          linkUrl="https://kybr.test/v/loja-exemplo"
        />
      </ToastProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Ninguém verificado ainda" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Coloque o link no seu cadastro de vendedores ou verifique sua base em lote.",
      ),
    ).toBeInTheDocument();
    // P8-009: spec S10 marks it primary.
    expect(
      screen.getByRole("button", { name: "Copiar link de cadastro" }),
    ).toHaveClass("bg-accent");
    expect(
      screen.getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("href", "/lote");
  });

  it("a search: sellers.empty.search with {busca} + Limpar busca (keeps the status)", () => {
    render(
      <SellersEmpty
        search={{ pagina: 1, q: "Fulano", status: "mudou" }}
        linkUrl="https://kybr.test/v/loja-exemplo"
      />,
    );
    expect(
      screen.getByText('Nenhum vendedor encontrado para "Fulano".'),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limpar busca" })).toHaveAttribute(
      "href",
      "/vendedores?status=mudou",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a filter alone: sellers.empty.filter + Mostrar todos clears the filter (spec 2026-10-10)", () => {
    render(
      <SellersEmpty
        search={{ pagina: 1, status: "bloqueado" }}
        linkUrl="https://kybr.test/v/loja-exemplo"
      />,
    );
    expect(
      screen.getByText("Nenhum vendedor com esse status."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mostrar todos" })).toHaveAttribute(
      "href",
      "/vendedores",
    );
  });
});
