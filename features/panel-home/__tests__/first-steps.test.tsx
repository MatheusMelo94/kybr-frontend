import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FirstSteps } from "@/features/panel-home/components/first-steps";

// T133 (AC 53): Primeiros passos, three items from primeiros_passos, the G2
// targets, and "Ocultar" through hideFirstStepsAction (not optimistic).

const hide = vi.fn();
vi.mock("@/features/panel-home/actions", () => ({
  hideFirstStepsAction: (input: unknown) => hide(input),
}));
const expire = vi.fn();
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

const STEPS = { lote: true, link: false, monitor: false, oculto: false };

beforeEach(() => {
  hide.mockReset();
  expire.mockReset();
});

describe("FirstSteps (T133, AC 53)", () => {
  it("lists the three steps with the G2 targets, done ones marked for screen readers", () => {
    render(<FirstSteps steps={STEPS} />);
    const card = screen.getByRole("region", { name: "Primeiros passos" });
    const items = within(card).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(
      within(card).getByRole("link", {
        name: "Verificar a base que você já tem",
      }),
    ).toHaveAttribute("href", "/lote");
    expect(
      within(card).getByRole("link", {
        name: "Colocar o link no seu cadastro de vendedores",
      }),
    ).toHaveAttribute("href", "/configuracoes#link");
    expect(
      within(card).getByRole("link", { name: "Ativar o monitoramento" }),
    ).toHaveAttribute("href", "/monitoramento");
    expect(items[0]).toHaveTextContent("feito");
    expect(items[1]).not.toHaveTextContent("feito");
    expect(items[2]).not.toHaveTextContent("feito");
  });

  it("Ocultar: the card stays while the action runs and goes after ok", async () => {
    let resolve: (value: { ok: true }) => void = () => undefined;
    hide.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<FirstSteps steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(hide).toHaveBeenCalledWith({ oculto: true });
    expect(
      screen.getByRole("region", { name: "Primeiros passos" }),
    ).toBeInTheDocument();
    resolve({ ok: true });
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Primeiros passos" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("a failure shows error.network inline and the card stays", async () => {
    hide.mockResolvedValue({ ok: false, code: "NETWORK" });
    render(<FirstSteps steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /conex|internet/i,
    );
    expect(
      screen.getByRole("region", { name: "Primeiros passos" }),
    ).toBeInTheDocument();
  });

  it("a thrown action counts as a failure", async () => {
    hide.mockRejectedValue(new Error("offline"));
    render(<FirstSteps steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
  });

  it("SESSAO_EXPIRADA takes the session-expiry path", async () => {
    hide.mockResolvedValue({ ok: false, code: "SESSAO_EXPIRADA" });
    render(<FirstSteps steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    await waitFor(() => expect(expire).toHaveBeenCalledOnce());
  });
});
