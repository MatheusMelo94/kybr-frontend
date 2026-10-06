import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
}));

import { ResultTable } from "@/features/panel-lote/components/result-table";
import { StatusFilter } from "@/features/panel-lote/components/status-filter";
import { TablePager } from "@/features/panel-lote/components/table-pager";
import type { BatchRowsPage } from "@/lib/api/schemas/panel/batches";

const PAGE: BatchRowsPage = {
  itens: [
    {
      cnpj: "11222333000181",
      razao_social: "Empresa Exemplo Ltda",
      status: "warn",
      motivos: ["Sem inscrição estadual ativa", "Motivo dois, com vírgula"],
    },
    { cnpj: "12ABC34501DE35", status: "erro", motivos: [], erro_codigo: "X" },
    {
      cnpj: "04000001000197",
      razao_social: "<img src=x onerror=alert(1)>",
      status: "ok",
      motivos: [],
    },
  ],
  proximo_cursor: "eyJvIjoyNX0",
  total: 184,
};

describe("ResultTable (AC 20 table, AC 76)", () => {
  it("CNPJ / Razão social / Situação / Motivos; the CNPJ masked and tabular", () => {
    render(<ResultTable page={PAGE} />);
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["CNPJ", "Razão social", "Situação", "Motivos"]);
    const rows = screen.getAllByRole("row").slice(1);
    const [first, second, third] = rows.map((row) =>
      within(row).getAllByRole("cell"),
    );
    expect(first?.[0]).toHaveTextContent("11.222.333/0001-81");
    expect(first?.[0]).toHaveClass("tabular-nums");
    expect(second?.[0]).toHaveTextContent("12.ABC.345/01DE-35");
    expect(first?.[2]).toHaveTextContent("Atenção");
    expect(first?.[2]?.querySelector("[aria-hidden]")).not.toBeNull();
    expect(second?.[2]).toHaveTextContent("Não consultados");
    // Motivos as a list, never joined with middle dots.
    expect(
      within(first?.[3] as HTMLElement)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Sem inscrição estadual ativa", "Motivo dois, com vírgula"]);
    expect(first?.[3]?.textContent).not.toContain("·");
    // A missing razão social renders empty; markup is text.
    expect(second?.[1]).toHaveTextContent("");
    expect(third?.[1]).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });

  it("P5-005: a filter that matches nothing → lote.table.empty in place of the body, headers kept", () => {
    render(
      <ResultTable page={{ itens: [], proximo_cursor: null, total: 0 }} />,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    const cell = screen.getByRole("cell");
    expect(cell).toHaveTextContent("Nenhuma empresa com esse status neste lote.");
    expect(cell).toHaveAttribute("colspan", "4");
  });
});

describe("StatusFilter (AC 21 filter)", () => {
  it("'Mostrar' offers Todos and the four words; a change replaces ?status= keeping the scroll", () => {
    const { rerender } = render(<StatusFilter status={undefined} />);
    const select = screen.getByRole("combobox", { name: "Mostrar" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Todos", "Tudo certo", "Atenção", "Crítico", "Não consultados"]);
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "bad" } });
    expect(router.replace).toHaveBeenCalledWith(
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b?status=bad",
      { scroll: false },
    );
    // A Suspense boundary can hide the page while the server renders, which
    // drops focus: when the new status arrives, the select takes it back.
    select.blur();
    rerender(<StatusFilter status="bad" />);
    expect(screen.getByRole("combobox", { name: "Mostrar" })).toHaveFocus();
    fireEvent.change(select, { target: { value: "" } });
    expect(router.replace).toHaveBeenLastCalledWith(
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
      { scroll: false },
    );
  });
});

describe("StatusFilter after the fallback's full reload", () => {
  it("takes the focus back once, from the stored flag", () => {
    sessionStorage.setItem("kybr-lote-filter-focus", "1");
    render(<StatusFilter status="bad" />);
    expect(screen.getByRole("combobox", { name: "Mostrar" })).toHaveFocus();
    expect(sessionStorage.getItem("kybr-lote-filter-focus")).toBeNull();
  });
});

describe("TablePager (contract C2; Security C11)", () => {
  const BASE = "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  it("Próximos 25 links to ?cursor= (built with URLSearchParams), keeping the filter", () => {
    render(
      <TablePager
        base={BASE}
        status="warn"
        cursor={undefined}
        next="eyJvIjoyNX0"
      />,
    );
    expect(screen.getByRole("link", { name: "Próximos 25" })).toHaveAttribute(
      "href",
      `${BASE}?status=warn&cursor=eyJvIjoyNX0`,
    );
    expect(
      screen.queryByRole("link", { name: "Voltar ao início" }),
    ).not.toBeInTheDocument();
  });

  it("Voltar ao início when a cursor is set; no Próximos 25 on the last page", () => {
    render(
      <TablePager
        base={BASE}
        status={undefined}
        cursor="eyJvIjoyNX0"
        next={null}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Voltar ao início" }),
    ).toHaveAttribute("href", BASE);
    expect(
      screen.queryByRole("link", { name: "Próximos 25" }),
    ).not.toBeInTheDocument();
  });

  it("a cursor that isn't base64url never becomes a link", () => {
    const { container } = render(
      <TablePager
        base={BASE}
        status={undefined}
        cursor={undefined}
        next="x&status=ok"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
