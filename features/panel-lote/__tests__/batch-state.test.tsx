import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/panel-lote/components/batch-failed", () => ({
  BatchFailed: () => <p>stopped</p>,
}));
vi.mock("@/features/panel-lote/components/batch-result", () => ({
  BatchResult: () => <p>result</p>,
}));

import { BatchState } from "@/features/panel-lote/components/batch-state";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";
import type { Batch } from "@/lib/api/schemas/panel/batches";

const STOPPED: Batch = {
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
};

let shell: ReturnType<typeof useShellStatus> | undefined;
function Probe() {
  shell = useShellStatus();
  return null;
}

function tree(batch: Batch, running: boolean) {
  return (
    <ShellStatusProvider
      initial={{
        contagens: { ...COUNTS, lote_em_andamento: running },
        plano: undefined,
      }}
    >
      <Probe />
      <BatchState batch={batch} contratarHref={undefined} />
    </ShellStatusProvider>
  );
}

describe("BatchState's shell catch-up (T85)", () => {
  it("a resume that settles at once: the result under a stale running /me still asks for a poll", () => {
    const { rerender } = render(tree(STOPPED, false));
    // "Verificar os que faltam": the shell is told a batch runs; the stopped
    // view's catch-up polls before the action's tree arrives.
    act(() => shell?.setLoteRunning(true));
    expect(shell?.pollRequests).toBe(1);
    // The action's tree: the layout read /me before the page's read settled
    // the batch, so /me still says running and holds the older usage.
    rerender(
      tree(
        {
          ...STOPPED,
          estado: "concluido_com_erros",
          processados: 6,
          concluido_em: "2026-10-05T10:05:00-03:00",
        },
        true,
      ),
    );
    expect(shell?.pollRequests).toBe(2);
  });
});
