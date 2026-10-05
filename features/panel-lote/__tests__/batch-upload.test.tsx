import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchFileState } from "@/features/panel-lote/use-batch-file";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";
import type { Plano } from "@/lib/api/schemas/panel/me";

const hook = vi.hoisted(() => ({
  state: { status: "idle" } as BatchFileState,
  parse: vi.fn(),
  build: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/features/panel-lote/use-batch-file", () => ({
  useBatchFile: () => hook,
}));

import { BatchUpload } from "@/features/panel-lote/components/batch-upload";

const PREVIEW = {
  kind: "preview" as const,
  headers: ["CNPJ"],
  rows: [["11222333000181"]],
  stats: [{ valid: 184, duplicates: 0, invalid: 0 }],
  detected: { cnpj: 0 },
};

function renderUpload(plano: Plano | undefined = { tipo: "pago", nome: "Essencial", usadas: 0, limite: 5000 }) {
  return render(
    <ShellStatusProvider initial={{ contagens: undefined, plano }}>
      <BatchUpload contratarHref={undefined} />
    </ShellStatusProvider>,
  );
}

beforeEach(() => {
  hook.state = { status: "idle" };
  vi.clearAllMocks();
});

describe("BatchUpload (T79)", () => {
  it("empty: the drop zone; a picked file goes to the worker", () => {
    renderUpload();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "lista.csv");
    fireEvent.change(input, { target: { files: [file] } });
    expect(hook.parse).toHaveBeenCalledWith(file);
  });

  it("announces reading, then the preview's counts, in one polite region", () => {
    hook.state = { status: "reading" };
    const { rerender } = renderUpload();
    expect(screen.getByRole("status")).toHaveTextContent("Lendo o arquivo…");
    hook.state = { status: "preview", preview: PREVIEW };
    rerender(
      <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
        <BatchUpload contratarHref={undefined} />
      </ShellStatusProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent('Encontramos 184 CNPJs na coluna "CNPJ".');
  });

  it("an error stays in the zone, which stays usable", () => {
    hook.state = { status: "error", error: "unreadable" };
    renderUpload();
    expect(
      screen.getAllByText("Não conseguimos ler o arquivo. Salve de novo como CSV e tente outra vez.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeEnabled();
  });

  it("a dropped folder → lote.error.type", () => {
    renderUpload();
    const zone = screen.getByText("CSV ou Excel com uma coluna de CNPJ. Até 5.000 linhas.").parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { files: [], items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] },
    });
    expect(hook.reset).toHaveBeenCalled();
    expect(
      screen.getAllByText("Este arquivo não é CSV nem Excel. Escolha outro.").length,
    ).toBeGreaterThan(0);
  });

  it("the detected column applies from the first render: focus on the heading, not the select (Q6b)", () => {
    hook.state = { status: "preview", preview: PREVIEW };
    renderUpload();
    expect(screen.getByRole("heading", { name: "Confira antes de verificar" })).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Coluna do CNPJ" })).toHaveValue("0");
  });

  it("the preview uses the live plan: 100 left → over the allowance", () => {
    hook.state = { status: "preview", preview: PREVIEW };
    renderUpload({ tipo: "teste", usadas: 100, limite: 200 });
    expect(
      screen.getByText(
        "A lista tem 184 CNPJs e você tem 100 verificações disponíveis. Remova linhas ou contrate um plano.",
      ),
    ).toBeVisible();
  });

  it("Trocar arquivo resets the worker and refocuses the drop button", async () => {
    hook.state = { status: "preview", preview: PREVIEW };
    const { rerender } = renderUpload();
    fireEvent.click(screen.getByRole("button", { name: "Trocar arquivo" }));
    expect(hook.reset).toHaveBeenCalled();
    hook.state = { status: "idle" };
    rerender(
      <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
        <BatchUpload contratarHref={undefined} />
      </ShellStatusProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toHaveFocus();
  });
});
