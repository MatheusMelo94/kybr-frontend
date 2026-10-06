import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// P5-002: BatchUpload with the REAL useBatchFile and a fake Worker. The
// worker is single-shot (ADR-0012 item 1: it ends after the payload), so
// once the rows are built the column is locked; a retry reuses the payload.

const start = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-lote/actions", () => ({ startBatchAction: start }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn(),
}));

import { BatchUpload } from "@/features/panel-lote/components/batch-upload";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";

const LINHAS = [{ cnpj: "11222333000181" }];
const PREVIEW = {
  kind: "preview",
  headers: ["CNPJ", "Outro"],
  rows: [["11.222.333/0001-81", "x"]],
  stats: [
    { valid: 1, duplicates: 0, invalid: 0 },
    { valid: 1, duplicates: 0, invalid: 0 },
  ],
  detected: { cnpj: 0 },
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: { kind: string }): void {
    // Answers on the next task with a structured clone, as a real worker would.
    const data = structuredClone(
      message.kind === "parse" ? PREVIEW : { kind: "payload", linhas: LINHAS },
    );
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data } as MessageEvent);
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function pickFile() {
  render(
    <ShellStatusProvider
      initial={{
        contagens: undefined,
        plano: { tipo: "pago", nome: "Essencial", usadas: 0, limite: 5000 },
      }}
    >
      <BatchUpload contratarHref={undefined} />
    </ShellStatusProvider>,
  );
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(["CNPJ\n"], "lista.csv")] },
    });
  });
}

const cta = () => screen.getByRole("button", { name: /^Verificar \d+ CNPJ/ });
const select = () => screen.getByRole("combobox", { name: "Coluna do CNPJ" });

describe("BatchUpload + useBatchFile (P5-002)", () => {
  it("build → a failed start → the column is locked → the retry reuses the payload and starts", async () => {
    start.mockResolvedValueOnce({ ok: false, code: "NETWORK" });
    start.mockResolvedValueOnce({
      ok: true,
      id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    });
    await pickFile();
    expect(select()).toBeEnabled();

    await act(async () => fireEvent.click(cta()));
    expect(start).toHaveBeenCalledTimes(1);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor.",
    );
    // The worker is gone: the column can't change any more.
    expect(select()).toBeDisabled();

    await act(async () => fireEvent.click(cta()));
    expect(start).toHaveBeenCalledTimes(2);
    const [first, second] = start.mock.calls.map(([input]) => input);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.linhas).toEqual(LINHAS);
    expect(router.push).toHaveBeenCalledWith(
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    );
  });

  it("402: the column is locked and Trocar arquivo starts over with an open select", async () => {
    start.mockResolvedValueOnce({
      ok: false,
      code: "SEM_SALDO",
      disponiveis: 0,
    });
    await pickFile();
    await act(async () => fireEvent.click(cta()));
    expect(select()).toBeDisabled();

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Trocar arquivo" })),
    );
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(["CNPJ\n"], "outra.csv")] },
      });
    });
    expect(select()).toBeEnabled();
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
