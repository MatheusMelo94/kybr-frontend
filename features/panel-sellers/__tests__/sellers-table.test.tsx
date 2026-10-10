import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { SellersProvider } from "@/features/panel-sellers/components/sellers-provider";
import { SellersTable } from "@/features/panel-sellers/components/sellers-table";
import type { SellerRow } from "@/lib/api/schemas/panel/sellers";

// T140 (AC 55): the columns and their cells. The rows arrive masked from the
// data layer (O-F4); the table renders them as text.

const ROW: SellerRow = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  razao_social: "Vendedor Exemplo Ltda",
  cnpj: "12.345.678/0001-95",
  responsavel: "Pessoa Exemplo",
  origem: "link",
  verificado_em: "2026-10-05T02:30:00Z",
  status: "aprovado",
  monitorado: true,
};

vi.mock("@/features/panel-sellers/actions", () => ({
  reverifyAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function renderTable(props: ComponentProps<typeof SellersTable>) {
  return render(
    <ToastProvider closeLabel="Fechar">
      <SellersProvider>
        <SellersTable {...props} />
      </SellersProvider>
    </ToastProvider>,
  );
}

function rows(...items: SellerRow[]) {
  renderTable({ rows: items });
  return screen.getAllByRole("row").slice(1);
}

describe("SellersTable", () => {
  it("has the sellers.col.* headers", () => {
    renderTable({ rows: [ROW] });
    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual([
      "Vendedor",
      "Responsável",
      "Origem",
      "Verificado em",
      "Status hoje",
      "Monitorado",
    ]);
  });

  it("a row: the name with the masked CNPJ under it, the responsável, the origin word, dd/mm/aaaa (São Paulo), the status word, Sim", () => {
    const [row] = rows(ROW);
    const cells = within(row as HTMLElement).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("Vendedor Exemplo Ltda");
    expect(cells[0]).toHaveTextContent("12.345.678/0001-95");
    expect(cells[1]).toHaveTextContent("Pessoa Exemplo");
    expect(cells[2]).toHaveTextContent("Link");
    expect(cells[3]).toHaveTextContent("04/10/2026");
    expect(cells[4]).toHaveTextContent("Aprovado");
    expect(cells[5]).toHaveTextContent("Sim");
  });

  it("no responsável → sellers.resp.none; lote; Não; review and blocked words", () => {
    const { responsavel: _unused, ...bare } = ROW;
    void _unused;
    const [first, second] = rows(
      { ...bare, origem: "lote", monitorado: false, status: "revisao" },
      { ...ROW, status: "bloqueado" },
    );
    const a = within(first as HTMLElement).getAllByRole("cell");
    expect(a[1]).toHaveTextContent("Não informado");
    expect(a[2]).toHaveTextContent("Lote");
    expect(a[4]).toHaveTextContent("Em revisão");
    expect(a[5]).toHaveTextContent("Não");
    expect(
      within(second as HTMLElement).getAllByRole("cell")[4],
    ).toHaveTextContent("Bloqueado");
  });

  it("Mudou: {resumo}; without a resumo the filter's word", () => {
    const [changed, bare] = rows(
      { ...ROW, status: "mudou", mudou: { resumo: "inapta" } },
      { ...ROW, status: "mudou" },
    );
    expect(
      within(changed as HTMLElement).getAllByRole("cell")[4],
    ).toHaveTextContent("Mudou: inapta");
    expect(
      within(bare as HTMLElement).getAllByRole("cell")[4],
    ).toHaveTextContent("Mudou desde a aprovação");
  });

  it("a null razão social shows the CNPJ alone", () => {
    const [row] = rows({ ...ROW, razao_social: null });
    expect(
      within(row as HTMLElement).getAllByRole("cell")[0]?.textContent,
    ).toBe("12.345.678/0001-95");
  });

  it("names with markup render as text", () => {
    const [row] = rows({
      ...ROW,
      razao_social: "<img src=x onerror=alert(1)>",
    });
    expect(row?.querySelector("img")).toBeNull();
    expect(row).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("the table scrolls inside its card (a labelled, focusable region)", () => {
    renderTable({ rows: [ROW] });
    expect(screen.getByRole("region", { name: "Vendedores" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("T141: Reverificar in each row's status cell; a pending row shows Reverificando…", () => {
    const [ready, pending] = rows(ROW, {
      ...ROW,
      id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      reverificacao_pendente: true,
    });
    const readyCell = within(ready as HTMLElement).getAllByRole("cell")[4];
    expect(
      within(readyCell as HTMLElement).getByRole("button", {
        name: "Reverificar",
      }),
    ).toBeEnabled();
    const pendingCell = within(pending as HTMLElement).getAllByRole("cell")[4];
    expect(pendingCell).toHaveTextContent("Reverificando…");
    expect(within(pendingCell as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("T141: the allowance used up disables every Reverificar, described by the plan note", () => {
    renderTable({ rows: [ROW], exhausted: { describedBy: "sem-saldo" } });
    const button = screen.getByRole("button", { name: "Reverificar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", "sem-saldo");
  });

  it("T143: the name links to the seller's detail", () => {
    const [row] = rows(ROW);
    expect(
      within(row as HTMLElement)
        .getByRole("link", { name: "Vendedor Exemplo Ltda" })
        .getAttribute("href"),
    ).toBe(`/vendedores/${ROW.id}`);
  });
});
