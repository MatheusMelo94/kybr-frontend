import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table, Td, Th } from "@/components/panel/table";

describe("Table (T76)", () => {
  function renderTable() {
    render(
      <Table label="Prévia do arquivo">
        <thead>
          <tr>
            <Th>CNPJ</Th>
            <Th>Responsável</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>11.222.333/0001-81</Td>
            <Td>Um nome muito longo que precisa quebrar dentro da célula</Td>
          </tr>
        </tbody>
      </Table>,
    );
  }

  it("is a real table, 560 px minimum, inside a card that scrolls sideways", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-[35rem]", "tabular-nums");
    const card = screen.getByRole("region", { name: "Prévia do arquivo" });
    expect(card).toContainElement(table);
    expect(card).toHaveClass("overflow-x-auto", "border-line");
    // A scrolling region must be reachable from the keyboard (axe).
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("header cells have scope col; long text wraps in cells", () => {
    renderTable();
    for (const header of screen.getAllByRole("columnheader"))
      expect(header).toHaveAttribute("scope", "col");
    expect(screen.getAllByRole("cell")[1]).toHaveClass("break-words");
  });
});
