import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { SellerDetail } from "@/features/panel-sellers/components/seller-detail";
import { SellersProvider } from "@/features/panel-sellers/components/sellers-provider";
import type { Seller } from "@/lib/api/schemas/panel/sellers";

// T143 (AC 58, G9, O-F4): the seller detail. The latest verification with
// the Fila's read-only parts, the history, Abrir caso, Reverificar and the
// proof.

vi.mock("@/features/panel-sellers/actions", () => ({
  reverifyAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const CURRENT = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
const OLDER = "d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a";
const CASE = "e3f4a5b6-c7d8-4e9f-8a1b-2c3d4e5f6a7b";

const SELLER: Seller = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  razao_social: "Vendedor Exemplo Ltda",
  cnpj: "12.345.678/0001-95",
  responsavel: "Pessoa Exemplo",
  origem: "link",
  verificado_em: "2026-10-05T02:30:00Z",
  status: "mudou",
  monitorado: true,
  verificacao_atual: {
    id: CURRENT,
    modo: "tempo_real",
    checagens: [
      {
        chave: "situacao",
        titulo: "Situação cadastral",
        descricao: "Na Receita Federal",
        valor: "Ativa",
        status: "ok",
      },
    ],
    criado_em: "2026-10-05T02:30:00Z",
  },
  verificacoes: [
    { id: CURRENT, veredito: "revisar", criado_em: "2026-10-05T02:30:00Z" },
    { id: OLDER, veredito: "aprovar", criado_em: "2026-09-01T15:00:00Z" },
  ],
  case_aberto_id: CASE,
};

function renderDetail(seller: Seller = SELLER) {
  return render(
    <ToastProvider closeLabel="Fechar">
      <SellersProvider>
        <SellerDetail seller={seller} />
      </SellersProvider>
    </ToastProvider>,
  );
}

describe("SellerDetail", () => {
  it("the latest verification with the Fila's parts: verdict, name as the h1, CNPJ, checks, consulted", () => {
    renderDetail();
    expect(
      screen.getByRole("heading", { level: 1, name: "Vendedor Exemplo Ltda" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Resultado das regras:").parentElement,
    ).toHaveTextContent("Revisar");
    expect(screen.getAllByText("12.345.678/0001-95").length).toBeGreaterThan(0);
    expect(screen.getByText("Situação cadastral")).toBeTruthy();
    expect(screen.getByText(/^Consultado em /)).toBeTruthy();
  });

  it("read-only: none of the Fila's decisions", () => {
    renderDetail();
    for (const name of ["Aprovar", "Bloquear", "Pedir documento"])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("the history: verdict + date per verification", () => {
    renderDetail();
    const history = screen.getByRole("region", {
      name: "Verificações anteriores",
    });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Revisar");
    expect(items[0]).toHaveTextContent("04/10/2026");
    expect(items[1]).toHaveTextContent("Aprovar");
    expect(items[1]).toHaveTextContent("01/09/2026");
  });

  it("Abrir caso links to the open case; without one there's no link", () => {
    const { unmount } = renderDetail();
    expect(
      screen.getByRole("link", { name: "Abrir caso" }).getAttribute("href"),
    ).toBe(`/fila/${CASE}`);
    unmount();
    const { case_aberto_id: _unused, ...noCase } = SELLER;
    void _unused;
    renderDetail(noCase);
    expect(screen.queryByRole("link", { name: "Abrir caso" })).toBeNull();
  });

  it("Reverificar and Baixar comprovante", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: "Reverificar" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Baixar comprovante" }),
    ).toBeTruthy();
  });

  it("G9: no current verification hides its block and the proof; the name stays the h1", () => {
    const { verificacao_atual: _unused, ...bare } = SELLER;
    void _unused;
    renderDetail({ ...bare, razao_social: null });
    expect(
      screen.getByRole("heading", { level: 1, name: "12.345.678/0001-95" }),
    ).toBeTruthy();
    expect(screen.queryByText("Situação cadastral")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Baixar comprovante" }),
    ).toBeNull();
    expect(
      screen.getByRole("region", { name: "Verificações anteriores" }),
    ).toBeTruthy();
  });
});
