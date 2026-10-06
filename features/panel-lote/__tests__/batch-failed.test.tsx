import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resume = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-lote/actions", () => ({ resumeBatchAction: resume }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import {
  BatchFocusKeeper,
  useBatchFocus,
} from "@/features/panel-lote/components/batch-focus-keeper";
import { BatchFailed } from "@/features/panel-lote/components/batch-failed";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";
import type { Batch } from "@/lib/api/schemas/panel/batches";

const BATCH: Batch = {
  id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  estado: "falhou",
  total: 6,
  processados: 3,
  contagens: { ok: 3, warn: 0, bad: 0, erro: 0 },
  iniciado_em: "2026-10-05T10:00:00-03:00",
  monitorado: false,
  enviado_para_fila: false,
};
const COUNTS = {
  fila_abertos: 7,
  fila_vencidos: 0,
  alertas_criticos_abertos: 0,
  vendedores: 1,
  lote_em_andamento: false,
};

let shell: ReturnType<typeof useShellStatus> | undefined;
function Probe({ live }: { live: boolean }) {
  shell = useShellStatus();
  const focus = useBatchFocus();
  if (live) focus.record(true);
  return null;
}

function renderFailed(live = false, contratarHref?: string) {
  return render(
    <ShellStatusProvider initial={{ contagens: COUNTS, plano: undefined }}>
      <BatchFocusKeeper>
        <Probe live={live} />
        <BatchFailed batch={BATCH} contratarHref={contratarHref} />
      </BatchFocusKeeper>
    </ShellStatusProvider>,
  );
}

const cta = () =>
  screen.getByRole("button", { name: "Verificar os que faltam" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BatchFailed (AC 22)", () => {
  it("lote.failed.h + .body with what was done, and the legend; a cold load isn't an alert", () => {
    renderFailed();
    expect(
      screen.getByRole("heading", { name: "A verificação parou no meio" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "3 de 6 CNPJs foram consultados. Os que faltam não consumiram verificações.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Tudo certo")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("seen live (the poll saw it stop): announced as an alert, once", () => {
    renderFailed(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A verificação parou no meio",
    );
  });

  it("Verificar os que faltam → busy → resume → the shell knows a batch runs", async () => {
    let finish: (value: unknown) => void = () => undefined;
    resume.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderFailed();
    await act(async () => fireEvent.click(cta()));
    expect(cta()).toHaveAttribute("aria-busy", "true");
    await act(async () => fireEvent.click(cta()));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith({ batchId: BATCH.id });
    await act(async () => finish({ ok: true }));
    expect(shell?.loteRunning).toBe(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("402 → plan.exhausted next to it (alert), Contratar with the contact; the button stays usable", async () => {
    resume.mockResolvedValue({ ok: false, code: "SEM_SALDO" });
    renderFailed(false, "mailto:vendas@exemplo.test");
    await act(async () => fireEvent.click(cta()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    );
    expect(screen.getByRole("link", { name: "Contratar" })).toHaveAttribute(
      "href",
      "mailto:vendas@exemplo.test",
    );
    expect(cta()).not.toHaveAttribute("aria-busy");
  });

  it("another failure → lote.action.error (alert); SESSAO_EXPIRADA → the expiry path", async () => {
    resume.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    renderFailed();
    await act(async () => fireEvent.click(cta()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não deu certo. Tente de novo.",
    );
    resume.mockResolvedValueOnce({ ok: false, code: "SESSAO_EXPIRADA" });
    await act(async () => fireEvent.click(cta()));
    expect(expire).toHaveBeenCalledTimes(1);
  });
});
