import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pollShellStatusAction = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/features/panel-shell/actions", () => ({ pollShellStatusAction }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SHELL_STATUS_INTERVAL_MS } from "@/features/panel-shell/polling";
import { ShellStatusPoller } from "@/features/panel-shell/components/shell-status-poller";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";

const COUNTS = {
  fila_abertos: 7,
  fila_vencidos: 2,
  alertas_criticos_abertos: 0,
  vendedores: 10,
  lote_em_andamento: false,
};
const PLANO = { tipo: "teste", usadas: 40, limite: 200 } as const;

function Probe() {
  const status = useShellStatus();
  return (
    <p data-testid="probe">
      {status.contagens
        ? `fila=${status.contagens.fila_abertos}`
        : "sem-contagens"}{" "}
      lote={String(status.loteRunning)} usadas=
      {status.plano?.usadas ?? "-"}
    </p>
  );
}

let visibility: DocumentVisibilityState = "visible";
let online = true;

function renderPoller() {
  render(
    <ShellStatusProvider initial={{ contagens: COUNTS, plano: PLANO }}>
      <ShellStatusPoller />
      <Probe />
    </ShellStatusProvider>,
  );
}

async function tick(ms = SHELL_STATUS_INTERVAL_MS): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  visibility = "visible";
  online = true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  pollShellStatusAction.mockResolvedValue({
    ok: true,
    contagens: { ...COUNTS, fila_abertos: 8 },
    plano: { ...PLANO, usadas: 41 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShellStatusPoller (ADR-0011 rule 3, AC 11)", () => {
  it("starts from the server's values, then polls every 60 s while visible and online", async () => {
    renderPoller();
    expect(screen.getByTestId("probe")).toHaveTextContent("fila=7");
    expect(pollShellStatusAction).not.toHaveBeenCalled();

    await tick();
    expect(pollShellStatusAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("probe")).toHaveTextContent("fila=8");
    expect(screen.getByTestId("probe")).toHaveTextContent("usadas=41");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("doesn't poll while hidden or offline", async () => {
    renderPoller();
    visibility = "hidden";
    await tick();
    visibility = "visible";
    online = false;
    await tick();

    expect(pollShellStatusAction).not.toHaveBeenCalled();
  });

  it("fires once on becoming visible, and once on coming back online", async () => {
    renderPoller();
    visibility = "hidden";
    await tick(1_000);
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pollShellStatusAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(pollShellStatusAction).toHaveBeenCalledTimes(2);
  });

  it("a failed poll hides the counts silently; a later success restores them", async () => {
    pollShellStatusAction.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    renderPoller();
    await tick();
    expect(screen.getByTestId("probe")).toHaveTextContent("sem-contagens");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await tick();
    expect(screen.getByTestId("probe")).toHaveTextContent("fila=8");
  });

  it("an unreachable action counts as a failed poll", async () => {
    pollShellStatusAction.mockRejectedValueOnce(new TypeError("fetch failed"));
    renderPoller();
    await tick();
    expect(screen.getByTestId("probe")).toHaveTextContent("sem-contagens");
  });

  it("exposes lote_em_andamento as loteRunning", async () => {
    pollShellStatusAction.mockResolvedValue({
      ok: true,
      contagens: { ...COUNTS, lote_em_andamento: true },
      plano: PLANO,
    });
    renderPoller();
    expect(screen.getByTestId("probe")).toHaveTextContent("lote=false");
    await tick();
    expect(screen.getByTestId("probe")).toHaveTextContent("lote=true");
  });
});
