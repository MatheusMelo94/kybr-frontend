import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShellCatchUp } from "@/features/panel-lote/components/shell-catch-up";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";

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

function renderWith(running: boolean) {
  return render(
    <ShellStatusProvider
      initial={{
        contagens: { ...COUNTS, lote_em_andamento: running },
        plano: undefined,
      }}
    >
      <Probe />
      <ShellCatchUp />
    </ShellStatusProvider>,
  );
}

describe("ShellCatchUp", () => {
  it("a settled batch under a shell that still says running: asks for one poll, /me decides", () => {
    renderWith(true);
    expect(shell?.pollRequests).toBe(1);
    expect(shell?.loteRunning).toBe(true);
  });

  it("a shell already in step: does nothing", () => {
    renderWith(false);
    expect(shell?.pollRequests).toBe(0);
  });
});
