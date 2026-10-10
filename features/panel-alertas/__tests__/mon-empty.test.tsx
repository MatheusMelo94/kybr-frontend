import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonEmpty } from "@/features/panel-alertas/components/mon-empty";

describe("MonEmpty (AC 49)", () => {
  it("unmonitored: mon.empty.unmonitored and Verificar em lote → /lote", () => {
    render(<MonEmpty state={{ kind: "unmonitored" }} />);
    expect(
      screen.getByText(
        "Nenhum vendedor monitorado ainda. Ative o monitoramento no resultado de um lote.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("href", "/lote");
  });

  it("nosweep: the first sweep's date, dd/mm/aaaa in Brasília; no action", () => {
    render(
      <MonEmpty state={{ kind: "nosweep", data: "2026-10-12T02:00:00Z" }} />,
    );
    expect(
      screen.getByText(
        "A primeira varredura acontece em 11/10/2026. Os alertas aparecem aqui.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("noalerts: the last sweep's date", () => {
    render(
      <MonEmpty state={{ kind: "noalerts", data: "2026-10-05T09:00:00Z" }} />,
    );
    expect(
      screen.getByText(
        "Nenhuma mudança encontrada. A última varredura foi em 05/10/2026.",
      ),
    ).toBeInTheDocument();
  });
});
