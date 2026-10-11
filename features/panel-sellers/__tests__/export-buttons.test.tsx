import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { ExportButtons } from "@/features/panel-sellers/components/export-buttons";

// T142 (AC 57, O-F5, G11): the sellers CSV for the current filter, with the
// count hint, and the audit trail over a De/Até period.

const NOW = "2026-10-06T02:30:00Z"; // the 5th in São Paulo
const RANGE = { de: "2026-07-05", ate: "2026-10-05" };
const EXPORT_ERROR = "Não conseguimos gerar o arquivo. Tente de novo.";
const TOO_LARGE =
  "O arquivo ficou grande demais. Reduza o período e tente de novo.";

const fetchMock = vi.fn();
const clicked: { download: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  clicked.length = 0;
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:kybr/1");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ download: this.download });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderButtons(total = 120) {
  return render(
    <ExportButtons
      search={{ status: "bloqueado", q: "exemplo" }}
      total={total}
      auditRange={RANGE}
    />,
  );
}

const csv = () => new Response('"CNPJ"\r\n', { status: 200 });

describe("ExportButtons", () => {
  it("the hint counts the filter's sellers and describes the button", () => {
    renderButtons();
    const button = screen.getByRole("button", { name: "Exportar CSV" });
    expect(button).toHaveAccessibleDescription(
      "Exporta os 120 vendedores do filtro atual.",
    );
  });

  it("one seller: the singular hint", () => {
    renderButtons(1);
    expect(
      screen.getByText("Exporta 1 vendedor do filtro atual."),
    ).toBeTruthy();
  });

  it("downloads the current filter's CSV under a dated name, busy meanwhile", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    renderButtons();
    const button = screen.getByRole("button", { name: "Exportar CSV" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/vendedores/exportar.csv?status=bloqueado&q=exemplo",
    );
    await act(async () => resolve(csv()));
    expect(clicked).toEqual([{ download: "kybr-vendedores-2026-10-05.csv" }]);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("P8-009: both alert regions are mounted, empty, before any failure", () => {
    renderButtons();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) expect(alert).toBeEmptyDOMElement();
  });

  it("a failed export: export.error inline, without the period hint", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    renderButtons();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    });
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(EXPORT_ERROR);
    expect(screen.queryByText(TOO_LARGE)).toBeNull();
  });

  it("the audit: De/Até default to the given range; the chosen period is sent", async () => {
    fetchMock.mockResolvedValue(csv());
    renderButtons();
    expect(screen.getByLabelText("De")).toHaveValue(RANGE.de);
    expect(screen.getByLabelText("Até")).toHaveValue(RANGE.ate);
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Exportar trilha de auditoria" }),
      );
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/vendedores/auditoria.csv?de=2026-01-01&ate=2026-10-05",
    );
    expect(clicked).toEqual([{ download: "kybr-auditoria-2026-10-05.csv" }]);
  });

  it("a failed audit: export.error + export.too_large (G11)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    renderButtons();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Exportar trilha de auditoria" }),
      );
    });
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent(
      `${EXPORT_ERROR} ${TOO_LARGE}`,
    );
  });
});
