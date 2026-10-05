import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BatchPreview } from "@/features/panel-lote/components/batch-preview";
import { DropZone } from "@/features/panel-lote/components/drop-zone";
import type { Preview } from "@/features/panel-lote/parser/protocol";

const PREVIEW: Preview = {
  kind: "preview",
  headers: ["CNPJ", "Responsável", "ID na plataforma"],
  rows: [
    ["04.000.000/0001-42", "<img src=x onerror=alert(1)>", "loja-0001"],
    ["04000001000197", "Bruno Teste", "loja-0002"],
  ],
  stats: [
    { valid: 184, duplicates: 4, invalid: 2 },
    { valid: 0, duplicates: 0, invalid: 190 },
    { valid: 0, duplicates: 0, invalid: 190 },
  ],
  detected: { cnpj: 0, responsavel: 1, extId: 2 },
};

function renderPreview(props: Partial<Parameters<typeof BatchPreview>[0]> = {}) {
  const handlers = { onColumn: vi.fn(), onStart: vi.fn(), onChangeFile: vi.fn() };
  render(
    <BatchPreview
      preview={PREVIEW}
      column={0}
      left={3760}
      gate={undefined}
      contratarHref={undefined}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const cta = () => screen.getByRole("button", { name: /^Verificar/ });

describe("BatchPreview (AC 16–18, AC 12 Lote half)", () => {
  it("the AC 16 counts, the table, the select and Verificar 184 CNPJs; focus on the heading", () => {
    const { onStart } = renderPreview();
    expect(screen.getByRole("heading", { name: "Confira antes de verificar" })).toHaveFocus();
    expect(screen.getByText('Encontramos 184 CNPJs na coluna "CNPJ".')).toBeVisible();
    expect(screen.getByText("4 CNPJs repetidos: verificamos uma vez só.")).toBeVisible();
    expect(screen.getByText("2 CNPJs inválidos: não serão consultados.")).toBeVisible();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(PREVIEW.headers);
    expect(screen.getByRole("combobox", { name: "Coluna do CNPJ" })).toHaveValue("0");
    expect(cta()).toHaveAccessibleName("Verificar 184 CNPJs");
    expect(cta()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(cta());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("spreadsheet text renders as text, never markup", () => {
    renderPreview();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
  });

  it("no column (AC 17): nocolumn on the select, which has focus; the CTA can't start", () => {
    const { onStart } = renderPreview({ column: undefined });
    const select = screen.getByRole("combobox", { name: "Coluna do CNPJ" });
    expect(select).toHaveFocus();
    expect(select).toHaveAccessibleDescription("Não achamos a coluna de CNPJ. Escolha qual é.");
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    expect(cta()).toHaveAccessibleDescription("Não achamos a coluna de CNPJ. Escolha qual é.");
    fireEvent.click(cta());
    expect(onStart).not.toHaveBeenCalled();
  });

  it("picking a column reports it; one with no valid CNPJ → novalid, the CTA can't start", () => {
    const { onColumn } = renderPreview({ column: 1 });
    expect(
      screen.getByRole("combobox", { name: "Coluna do CNPJ" }),
    ).toHaveAccessibleDescription(
      "Nenhum CNPJ válido nesta coluna. Escolha outra coluna ou outro arquivo.",
    );
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0" } });
    expect(onColumn).toHaveBeenCalledWith(0);
  });

  it("over the allowance (AC 18): over_allowance with {validos} and {n}, Contratar with the contact", () => {
    renderPreview({ left: 100, contratarHref: "mailto:vendas@exemplo.test" });
    const reason =
      "A lista tem 184 CNPJs e você tem 100 verificações disponíveis. Remova linhas ou contrate um plano.";
    expect(screen.getByText(reason)).toBeVisible();
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    expect(cta()).toHaveAccessibleDescription(`${reason} Contratar`);
    expect(screen.getByRole("link", { name: "Contratar" })).toHaveAttribute(
      "href",
      "mailto:vendas@exemplo.test",
    );
  });

  it.each([
    ["exhausted", "As verificações do plano acabaram. Contrate para continuar verificando."],
    ["none", "Esta conta ainda não tem verificações liberadas."],
  ] as const)("plan %s (AC 12): the plan text next to the CTA instead of over_allowance", (gate, text) => {
    renderPreview({ gate, left: 0 });
    expect(cta()).toHaveAccessibleDescription(text);
    expect(screen.queryByText(/A lista tem/)).not.toBeInTheDocument();
  });

  it("Trocar arquivo", () => {
    const { onChangeFile } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Trocar arquivo" }));
    expect(onChangeFile).toHaveBeenCalled();
  });

  it("one valid CNPJ reads in the singular", () => {
    renderPreview({
      preview: { ...PREVIEW, stats: [{ valid: 1, duplicates: 0, invalid: 0 }, ...PREVIEW.stats.slice(1)] },
    });
    expect(cta()).toHaveAccessibleName("Verificar 1 CNPJ");
    expect(screen.queryByText(/repetido/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inválido/)).not.toBeInTheDocument();
  });
});

describe("DropZone (AC 14, 15)", () => {
  it("a real button opens the hidden file input; the drag text is for fine pointers", () => {
    const onFile = vi.fn();
    render(<DropZone reading={false} error={undefined} onFile={onFile} onFolder={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute("accept", ".csv,.xlsx,.xls");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo" }));
    expect(click).toHaveBeenCalled();
    expect(screen.getByText("Arraste uma planilha ou escolha o arquivo")).toHaveClass("hidden", "pointer-fine:block");
    const file = new File(["x"], "lista.csv");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("dropping takes the first file; a folder → onFolder", () => {
    const onFile = vi.fn();
    const onFolder = vi.fn();
    render(<DropZone reading={false} error={undefined} onFile={onFile} onFolder={onFolder} />);
    const zone = screen.getByText("CSV ou Excel com uma coluna de CNPJ. Até 5.000 linhas.").parentElement as HTMLElement;
    const first = new File(["a"], "a.csv");
    fireEvent.drop(zone, { dataTransfer: { files: [first, new File(["b"], "b.csv")], items: [] } });
    expect(onFile).toHaveBeenCalledWith(first);
    fireEvent.drop(zone, {
      dataTransfer: { files: [], items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] },
    });
    expect(onFolder).toHaveBeenCalled();
  });

  it("reading shows lote.reading; an error shows its copy, linked to the button", () => {
    const { rerender } = render(
      <DropZone reading error={undefined} onFile={vi.fn()} onFolder={vi.fn()} />,
    );
    expect(screen.getByText("Lendo o arquivo…")).toBeVisible();
    rerender(<DropZone reading={false} error="too_many" onFile={vi.fn()} onFolder={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toHaveAccessibleDescription(
      "A lista tem mais de 5.000 linhas. Divida em arquivos menores.",
    );
  });
});
