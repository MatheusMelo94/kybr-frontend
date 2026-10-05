import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poll = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-lote/actions", () => ({ pollBatchAction: poll }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import {
  BatchFocusKeeper,
  useBatchFocus,
} from "@/features/panel-lote/components/batch-focus-keeper";
import { BatchProgress } from "@/features/panel-lote/components/batch-progress";
import { BATCH_PROGRESS_INTERVAL_MS } from "@/features/panel-shell/polling";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const COUNTS = {
  fila_abertos: 7,
  fila_vencidos: 0,
  alertas_criticos_abertos: 0,
  vendedores: 1,
  lote_em_andamento: true,
};

let shell: ReturnType<typeof useShellStatus> | undefined;
let focus: ReturnType<typeof useBatchFocus> | undefined;
function Probe() {
  shell = useShellStatus();
  focus = useBatchFocus();
  return null;
}

function renderProgress(processados = 0, total = 200) {
  return render(
    <ShellStatusProvider initial={{ contagens: COUNTS, plano: undefined }}>
      <BatchFocusKeeper>
        <BatchProgress batchId={ID} initial={{ processados, total }} />
        <Probe />
      </BatchFocusKeeper>
    </ShellStatusProvider>,
  );
}

function answer(processados: number, total = 200, estado = "processando") {
  poll.mockResolvedValueOnce({
    ok: true,
    batch: { estado, total, processados },
  });
}

async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(BATCH_PROGRESS_INTERVAL_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BatchProgress (AC 19)", () => {
  it("heading, count in tabular figures, a determinate bar named by the heading, the leave line; focus on the heading (Q6)", () => {
    renderProgress(50);
    const heading = screen.getByRole("heading", {
      name: "Verificando 200 CNPJs",
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText("50 de 200", { selector: "p" })).toHaveClass("tabular-nums");
    const bar = screen.getByRole("progressbar", {
      name: "Verificando 200 CNPJs",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "200");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.25)");
    expect(fill).toHaveClass(
      "duration-(--duration-base)",
      "motion-reduce:transition-none",
    );
    expect(
      screen.getByText(
        "Pode sair desta tela. A verificação continua e o resultado fica aqui.",
      ),
    ).toBeVisible();
  });

  it("polls every 2 s, never overlapping", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    poll.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderProgress();
    await tick();
    await tick();
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledWith({ batchId: ID });
    await act(async () =>
      resolve({
        ok: true,
        batch: { estado: "processando", total: 200, processados: 50 },
      }),
    );
    expect(screen.getByText("50 de 200", { selector: "p" })).toBeVisible();
    answer(100);
    await tick();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(screen.getByText("100 de 200", { selector: "p" })).toBeVisible();
  });

  it("doesn't poll while hidden or offline; polls once on becoming visible; offline shows stale (Q18)", async () => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    renderProgress();
    await tick();
    expect(poll).not.toHaveBeenCalled();
    answer(20);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(poll).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(
      screen.getByText("Reconectando… Os números voltam a atualizar sozinhos."),
    ).toBeVisible();
  });

  it("announces the start, then at most once per 10 % step crossed", async () => {
    renderProgress(0, 100);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Verificando 100 CNPJs");
    answer(5, 100);
    await tick();
    expect(region).toHaveTextContent("Verificando 100 CNPJs");
    answer(60, 100);
    await tick();
    expect(region).toHaveTextContent("60 de 100");
    answer(65, 100);
    await tick();
    expect(region).toHaveTextContent("60 de 100");
    answer(71, 100);
    await tick();
    expect(region).toHaveTextContent("71 de 100");
  });

  it("a failed poll → stale with the last numbers; polling recovers by itself", async () => {
    renderProgress(40);
    poll.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    await tick();
    expect(
      screen.getByText("Reconectando… Os números voltam a atualizar sozinhos."),
    ).toBeVisible();
    expect(screen.getByText("40 de 200", { selector: "p" })).toBeVisible();
    answer(80);
    await tick();
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    expect(screen.getByText("80 de 200", { selector: "p" })).toBeVisible();
  });

  it("SESSAO_EXPIRADA → the session-expiry path once", async () => {
    renderProgress();
    poll.mockResolvedValue({ ok: false, code: "SESSAO_EXPIRADA" });
    await tick();
    await tick();
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it.each(["concluido", "concluido_com_erros", "falhou"])(
    "%s: one refresh, the shell's running flag cleared, the plan re-polled; focus recorded",
    async (estado) => {
      renderProgress();
      answer(200, 200, estado);
      await tick();
      await tick();
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(shell?.loteRunning).toBe(false);
      expect(shell?.pollRequests).toBe(1);
      expect(focus?.wasInProgress()).toBe(true);
    },
  );

  it("focus outside the region at the end is recorded too", async () => {
    renderProgress();
    (document.activeElement as HTMLElement | null)?.blur();
    answer(200, 200, "concluido");
    await tick();
    expect(focus?.wasInProgress()).toBe(false);
  });

  it("NOT_FOUND → a refresh (the server renders not found)", async () => {
    renderProgress();
    poll.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
    await tick();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
