import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupCompanyAction } from "@/features/seller-link/actions";
import { VerificationForm } from "@/features/seller-link/components/verification-form";

vi.mock("@/features/seller-link/actions", () => ({
  lookupCompanyAction: vi.fn(),
}));

const lookup = vi.mocked(lookupCompanyAction);
const FOUND = {
  ok: true,
  company: {
    razaoSocial: "JOAO CARLOS SILVA ***.***.***-**",
    atividade: "Comércio a varejo de peças",
    municipio: "Campinas",
    uf: "SP",
  },
} as const;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function cnpjInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "CNPJ da empresa" });
}

beforeEach(() => {
  lookup.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VerificationForm: CNPJ lookup", () => {
  it("AC 7: a valid alphanumeric CNPJ triggers exactly one lookup, then shows and announces the company", async () => {
    const user = userEvent.setup();
    lookup.mockResolvedValue(FOUND);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "12.ABC.345/01DE-35");

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("loja-exemplo", "12ABC34501DE35");
    expect(
      await screen.findByText(
        "Atividade principal: Comércio a varejo de peças",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Campinas, SP")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Empresa encontrada: JOAO CARLOS SILVA CPF oculto.",
    );
  });

  it("AC 7: shows the skeleton and announces the search while the lookup runs", async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof FOUND>();
    lookup.mockReturnValue(pending.promise);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");

    expect(screen.getByTestId("company-block")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Buscando os dados da empresa…",
    );
    await act(async () => pending.resolve(FOUND));
  });

  it("never looks up an invalid CNPJ", async () => {
    const user = userEvent.setup();
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "12.ABC.345/01DE-36");

    expect(lookup).not.toHaveBeenCalled();
  });

  it("AC 8: not found shows its note, announces it, and keeps submit enabled", async () => {
    const user = userEvent.setup();
    lookup.mockResolvedValue({ ok: false, reason: "not_found" });
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");

    const note =
      "Ainda não encontramos os dados dessa empresa. Você pode continuar: vamos conferir com calma.";
    expect(
      await screen.findByText(note, { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(note);
    expect(
      screen.getByRole("button", { name: "Verificar empresa" }),
    ).toBeEnabled();
  });

  it.each([
    [
      "a failed result",
      () => lookup.mockResolvedValue({ ok: false, reason: "failed" }),
    ],
    [
      "a network error",
      () => lookup.mockRejectedValue(new TypeError("Failed to fetch")),
    ],
  ])(
    "AC 9: %s shows the failed note, keeps submit enabled, and never retries",
    async (_case, arrange) => {
      const user = userEvent.setup();
      arrange();
      render(<VerificationForm slug="loja-exemplo" />);

      await user.type(cnpjInput(), "11222333000181");

      expect(
        await screen.findByText(
          "Não conseguimos buscar os dados da empresa agora. Você pode continuar mesmo assim.",
          { selector: "p" },
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Verificar empresa" }),
      ).toBeEnabled();
      await act(async () => new Promise((done) => setTimeout(done, 50)));
      expect(lookup).toHaveBeenCalledTimes(1);
    },
  );

  it("AC 7: ignores a stale response once the CNPJ has been edited", async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof FOUND>();
    lookup.mockReturnValue(pending.promise);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");
    await user.type(cnpjInput(), "{Backspace}");
    await act(async () => pending.resolve(FOUND));

    expect(screen.queryByText("Campinas, SP")).toBeNull();
    expect(screen.queryByTestId("company-block")).toBeNull();
  });
});
