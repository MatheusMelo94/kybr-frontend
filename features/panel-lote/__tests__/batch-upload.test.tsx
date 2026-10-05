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
const start = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-lote/actions", () => ({ startBatchAction: start }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { BatchUpload } from "@/features/panel-lote/components/batch-upload";

const PREVIEW = {
  kind: "preview" as const,
  headers: ["CNPJ"],
  rows: [["11222333000181"]],
  stats: [{ valid: 184, duplicates: 0, invalid: 0 }],
  detected: { cnpj: 0 },
};

function renderUpload(
  plano: Plano | undefined = {
    tipo: "pago",
    nome: "Essencial",
    usadas: 0,
    limite: 5000,
  },
) {
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
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
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
    expect(screen.getByRole("status")).toHaveTextContent(
      'Encontramos 184 CNPJs na coluna "CNPJ".',
    );
  });

  it("an error stays in the zone, which stays usable", () => {
    hook.state = { status: "error", error: "unreadable" };
    renderUpload();
    expect(
      screen.getAllByText(
        "Não conseguimos ler o arquivo. Salve de novo como CSV e tente outra vez.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Escolher arquivo" }),
    ).toBeEnabled();
  });

  it("a dropped folder → lote.error.type", () => {
    renderUpload();
    const zone = screen.getByText(
      "CSV ou Excel com uma coluna de CNPJ. Até 5.000 linhas.",
    ).parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [],
        items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }],
      },
    });
    expect(hook.reset).toHaveBeenCalled();
    expect(
      screen.getAllByText("Este arquivo não é CSV nem Excel. Escolha outro.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("the detected column applies from the first render: focus on the heading, not the select (Q6b)", () => {
    hook.state = { status: "preview", preview: PREVIEW };
    renderUpload();
    expect(
      screen.getByRole("heading", { name: "Confira antes de verificar" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("combobox", { name: "Coluna do CNPJ" }),
    ).toHaveValue("0");
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
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined)),
      );
    });
    expect(
      screen.getByRole("button", { name: "Escolher arquivo" }),
    ).toHaveFocus();
  });
});

describe("BatchUpload: starting a batch (T80, AC 16, 18, 19)", () => {
  const LINHAS = [{ cnpj: "11222333000181" }];
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function startPreview(plano?: Plano) {
    hook.state = { status: "preview", preview: PREVIEW };
    hook.build.mockResolvedValue(LINHAS);
    return renderUpload(plano);
  }

  const cta = () =>
    screen.getByRole("button", { name: /^(Verificar|Começando)/ });

  it("builds the payload in the worker, posts it with a uuid key, and opens /lote/{id}", async () => {
    start.mockResolvedValue({
      ok: true,
      id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    });
    startPreview();
    await act(async () => fireEvent.click(cta()));
    expect(hook.build).toHaveBeenCalledWith(0);
    expect(start).toHaveBeenCalledWith({
      idempotencyKey: expect.stringMatching(UUID),
      linhas: LINHAS,
    });
    expect(router.push).toHaveBeenCalledWith(
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    );
  });

  it("is busy while starting (lote.start.busy, aria-busy); a double click starts once", async () => {
    let finish: (value: unknown) => void = () => undefined;
    start.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    startPreview();
    await act(async () => fireEvent.click(cta()));
    expect(cta()).toHaveAccessibleName("Começando…");
    expect(cta()).toHaveAttribute("aria-busy", "true");
    await act(async () => fireEvent.click(cta()));
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({ ok: true, id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b" }),
    );
  });

  it("a network error → error.network with the preview kept; the retry reuses the key and the rows", async () => {
    start.mockResolvedValueOnce({ ok: false, code: "NETWORK" });
    start.mockResolvedValueOnce({
      ok: true,
      id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    });
    startPreview();
    await act(async () => fireEvent.click(cta()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    expect(
      screen.getByRole("heading", { name: "Confira antes de verificar" }),
    ).toBeVisible();
    await act(async () => fireEvent.click(cta()));
    const [first, second] = start.mock.calls.map(([input]) => input);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(hook.build).toHaveBeenCalledTimes(1);
  });

  it("402 → the over-allowance state with the server's disponiveis", async () => {
    start.mockResolvedValue({ ok: false, code: "SEM_SALDO", disponiveis: 50 });
    startPreview();
    await act(async () => fireEvent.click(cta()));
    expect(
      screen.getByText(
        "A lista tem 184 CNPJs e você tem 50 verificações disponíveis. Remova linhas ou contrate um plano.",
      ),
    ).toBeVisible();
    expect(cta()).toHaveAttribute("aria-disabled", "true");
  });

  it("SESSAO_EXPIRADA → the session-expiry path", async () => {
    start.mockResolvedValue({ ok: false, code: "SESSAO_EXPIRADA" });
    startPreview();
    await act(async () => fireEvent.click(cta()));
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("a new column renews the key", async () => {
    start.mockResolvedValue({ ok: false, code: "NETWORK" });
    hook.state = {
      status: "preview",
      preview: {
        ...PREVIEW,
        headers: ["CNPJ", "Outro"],
        rows: [["11222333000181", "x"]],
        stats: [PREVIEW.stats[0]!, { valid: 2, duplicates: 0, invalid: 0 }],
      },
    };
    hook.build.mockResolvedValue(LINHAS);
    renderUpload();
    await act(async () => fireEvent.click(cta()));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    await act(async () => fireEvent.click(cta()));
    const [first, second] = start.mock.calls.map(([input]) => input);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(hook.build).toHaveBeenLastCalledWith(1);
  });

  it("a payload the worker can't build → lote.error.unreadable, nothing sent", async () => {
    startPreview();
    hook.build.mockResolvedValue(undefined);
    await act(async () => fireEvent.click(cta()));
    expect(start).not.toHaveBeenCalled();
  });
});
