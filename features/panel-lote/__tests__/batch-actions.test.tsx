import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  sendToQueueAction: vi.fn(),
  monitorBatchAction: vi.fn(),
}));
vi.mock("@/features/panel-lote/actions", () => actions);
const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { ToastProvider } from "@/components/panel/toast";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";
import { BatchActions } from "@/features/panel-lote/components/batch-actions";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let shell: ReturnType<typeof useShellStatus> | undefined;
function Probe() {
  shell = useShellStatus();
  return null;
}
const COUNTS = {
  fila_abertos: 7,
  fila_vencidos: 0,
  alertas_criticos_abertos: 0,
  vendedores: 1,
  lote_em_andamento: false,
};

function renderActions(
  props: Partial<Parameters<typeof BatchActions>[0]> = {},
) {
  return render(
    <ShellStatusProvider initial={{ contagens: COUNTS, plano: undefined }}>
      <Probe />
      <ToastProvider closeLabel="Fechar">
        <BatchActions
          batchId={ID}
          contagens={{ ok: 150, warn: 20, bad: 11, erro: 3 }}
          enviadoParaFila={false}
          monitorado={false}
          {...props}
        />
      </ToastProvider>
    </ShellStatusProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BatchActions: to the Fila (AC 23)", () => {
  it("'Mandar os {n} para a fila' with n = warn + bad; hidden when n = 0", () => {
    const { unmount } = renderActions();
    expect(
      screen.getByRole("button", { name: "Mandar os 31 para a fila" }),
    ).toBeVisible();
    // AC 76: the count in the label is tabular.
    expect(
      screen.getByRole("button", { name: "Mandar os 31 para a fila" }),
    ).toHaveClass("tabular-nums");
    unmount();
    renderActions({ contagens: { ok: 3, warn: 0, bad: 0, erro: 0 } });
    expect(
      screen.queryByRole("button", { name: /para a fila/ }),
    ).not.toBeInTheDocument();
  });

  it("one case reads 'Mandar 1 para a fila'", () => {
    renderActions({ contagens: { ok: 3, warn: 1, bad: 0, erro: 0 } });
    expect(
      screen.getByRole("button", { name: "Mandar 1 para a fila" }),
    ).toBeVisible();
  });

  it("busy → the toast with criados → the button becomes 'Abrir fila' (/fila)", async () => {
    let finish: (value: unknown) => void = () => undefined;
    actions.sendToQueueAction.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    renderActions();
    const button = screen.getByRole("button", {
      name: "Mandar os 31 para a fila",
    });
    await act(async () => fireEvent.click(button));
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => fireEvent.click(button));
    expect(actions.sendToQueueAction).toHaveBeenCalledTimes(1);
    expect(actions.sendToQueueAction).toHaveBeenCalledWith({
      batchId: ID,
      idempotencyKey: expect.stringMatching(UUID),
    });
    await act(async () => finish({ ok: true, count: 31 }));
    expect(screen.getByRole("status")).toHaveTextContent("31 casos na fila");
    expect(screen.getByRole("link", { name: "Abrir fila" })).toHaveAttribute(
      "href",
      "/fila",
    );
    expect(shell?.contagens?.fila_abertos).toBe(7 + 31);
  });

  it("already sent on load → 'Abrir fila' directly", () => {
    renderActions({ enviadoParaFila: true });
    expect(screen.getByRole("link", { name: "Abrir fila" })).toBeVisible();
  });

  it("an error → lote.action.error next to it (alert); the retry reuses the key", async () => {
    actions.sendToQueueAction.mockResolvedValueOnce({
      ok: false,
      code: "FAILED",
    });
    actions.sendToQueueAction.mockResolvedValueOnce({ ok: true, count: 31 });
    renderActions();
    const button = screen.getByRole("button", {
      name: "Mandar os 31 para a fila",
    });
    await act(async () => fireEvent.click(button));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não deu certo. Tente de novo.",
    );
    expect(button).not.toHaveAttribute("aria-busy");
    await act(async () => fireEvent.click(button));
    const [first, second] = actions.sendToQueueAction.mock.calls.map(
      ([input]) => input as { idempotencyKey: string },
    );
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
  });

  it("SESSAO_EXPIRADA → the session-expiry path", async () => {
    actions.sendToQueueAction.mockResolvedValue({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    renderActions();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Mandar os 31 para a fila" }),
      ),
    );
    expect(expire).toHaveBeenCalledTimes(1);
  });
});

describe("BatchActions: monitoring (AC 24 panel half)", () => {
  it("'Ativar monitoramento semanal' → the toast → the 'Monitoramento ativo' pill (blue dot, ink text)", async () => {
    actions.monitorBatchAction.mockResolvedValue({ ok: true, count: 181 });
    renderActions();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Ativar monitoramento semanal" }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Monitoramento ativado para 181 vendedores",
    );
    const pill = screen.getByText("Monitoramento ativo");
    expect(pill).toHaveClass("text-ink");
    expect(pill.querySelector(".bg-monitor")).not.toBeNull();
  });

  it("monitored on load → the pill; no successful row → no button", () => {
    const { unmount } = renderActions({ monitorado: true });
    expect(screen.getByText("Monitoramento ativo")).toBeVisible();
    unmount();
    renderActions({ contagens: { ok: 0, warn: 0, bad: 0, erro: 2 } });
    expect(
      screen.queryByRole("button", { name: /monitoramento/ }),
    ).not.toBeInTheDocument();
  });

  it("an error → lote.action.error next to that button", async () => {
    actions.monitorBatchAction.mockResolvedValue({ ok: false, code: "FAILED" });
    renderActions();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Ativar monitoramento semanal" }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não deu certo. Tente de novo.",
    );
    expect(
      screen.getByRole("button", { name: "Ativar monitoramento semanal" }),
    ).toBeEnabled();
  });
});
