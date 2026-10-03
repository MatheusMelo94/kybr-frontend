import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  lookupCompanyAction,
  startVerification,
} from "@/features/seller-link/actions";
import { VerificationForm } from "@/features/seller-link/components/verification-form";

vi.mock("@/features/seller-link/actions", () => ({
  lookupCompanyAction: vi.fn(),
  startVerification: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const lookup = vi.mocked(lookupCompanyAction);
const start = vi.mocked(startVerification);
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
  start.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
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
      // Flush every pending task: a retry would have been dispatched by now.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(lookup).toHaveBeenCalledTimes(1);
    },
  );

  it("review 0003: re-entering the same CNPJ after an edit restores its block, with no second lookup", async () => {
    const user = userEvent.setup();
    lookup.mockResolvedValue(FOUND);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");
    await screen.findByText("Campinas, SP");
    await user.type(cnpjInput(), "{Backspace}");
    expect(screen.queryByTestId("company-block")).toBeNull();
    await user.type(cnpjInput(), "1");

    expect(screen.getByText("Campinas, SP")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Empresa encontrada: JOAO CARLOS SILVA CPF oculto.",
    );
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("review 0003: going back to an earlier CNPJ reuses its result (one D2 call per CNPJ)", async () => {
    const user = userEvent.setup();
    lookup.mockResolvedValue(FOUND);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");
    await screen.findByText("Campinas, SP");
    await user.clear(cnpjInput());
    await user.type(cnpjInput(), "12345678000195");
    await user.clear(cnpjInput());
    await user.type(cnpjInput(), "11222333000181");

    expect(screen.getByText("Campinas, SP")).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("review 0003: re-entering the same CNPJ while its lookup runs shows the skeleton, then the result", async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof FOUND>();
    lookup.mockReturnValue(pending.promise);
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "11222333000181");
    await user.type(cnpjInput(), "{Backspace}1");
    expect(screen.getByTestId("company-block")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => pending.resolve(FOUND));

    expect(screen.getByText("Campinas, SP")).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

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

function nameInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Nome completo do responsável" });
}

function submit(): HTMLElement {
  return screen.getByRole("button", { name: "Verificar empresa" });
}

describe("VerificationForm: name field and submit validation", () => {
  beforeEach(() => {
    lookup.mockResolvedValue({ ok: false, reason: "not_found" });
  });

  it("has a labeled name field with autofill, a hint and a 120-character limit", () => {
    render(<VerificationForm slug="loja-exemplo" />);

    expect(nameInput()).toHaveAttribute("autocomplete", "name");
    expect(nameInput()).toHaveAttribute("maxlength", "120");
    expect(nameInput()).toHaveAccessibleDescription(
      "Nome e sobrenome de quem está fazendo o cadastro.",
    );
  });

  it("F07: ignores characters a name can't hold, as typed", async () => {
    const user = userEvent.setup();
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(nameInput(), "Ana<3 D’Ávila-Silva.");

    expect(nameInput()).toHaveValue("Ana D'Ávila-Silva.");
  });

  it.each(["’", "‘", "ʼ", "´", "`"])(
    "spec § Name field behavior: a typed %s becomes '",
    async (mark) => {
      const user = userEvent.setup();
      render(<VerificationForm slug="loja-exemplo" />);

      await user.type(nameInput(), `Ana D${mark}Ávila`);

      expect(nameInput()).toHaveValue("Ana D'Ávila");
    },
  );

  describe("dead keys and IME composition (ABNT2 ´ ~ ^, Gboard)", () => {
    /** One composition: the in-progress values, then the committed value. */
    function compose(
      input: HTMLInputElement,
      composing: readonly string[],
      committed: string,
    ): void {
      fireEvent.compositionStart(input);
      for (const value of composing)
        fireEvent.change(input, { target: { value } });
      fireEvent.change(input, { target: { value: committed } });
      fireEvent.compositionEnd(input);
    }

    it.each([
      ["José", "Jos", "´", "é", ""],
      ["João", "Jo", "~", "ã", "o"],
      ["Conceição", "Conceiç", "~", "ã", "o"],
      ["Ângela", "", "^", "Â", "ngela"],
    ])(
      "%s: the dead key stays in the field while composing, and the accented letter lands",
      (expected, before, deadKey, accented, after) => {
        render(<VerificationForm slug="loja-exemplo" />);
        const input = nameInput();
        fireEvent.change(input, { target: { value: before } });

        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: `${before}${deadKey}` } });
        expect(input).toHaveValue(`${before}${deadKey}`);
        fireEvent.change(input, { target: { value: `${before}${accented}` } });
        fireEvent.compositionEnd(input);
        fireEvent.change(input, {
          target: { value: `${before}${accented}${after}` },
        });

        expect(input).toHaveValue(expected);
      },
    );

    it("a dead ´ completed on its own (´ then space) becomes ' once composition ends", () => {
      render(<VerificationForm slug="loja-exemplo" />);
      const input = nameInput();
      fireEvent.change(input, { target: { value: "Ana D" } });

      compose(input, ["Ana D´"], "Ana D´");

      expect(input).toHaveValue("Ana D'");
    });

    it("a dead ~ or ^ completed on its own is dropped once composition ends", () => {
      render(<VerificationForm slug="loja-exemplo" />);
      const input = nameInput();
      fireEvent.change(input, { target: { value: "Ana" } });

      compose(input, ["Ana~"], "Ana~");

      expect(input).toHaveValue("Ana");
    });
  });

  it.each([
    ["", "Informe o nome completo do responsável."],
    ["Maria", "Escreva nome e sobrenome."],
  ])(
    "AC 10: submitting the name %j shows its error, linked, with focus on the field",
    async (name, message) => {
      const user = userEvent.setup();
      render(<VerificationForm slug="loja-exemplo" />);

      await user.type(cnpjInput(), "11222333000181");
      if (name) await user.type(nameInput(), name);
      await user.click(submit());

      expect(nameInput()).toHaveAttribute("aria-invalid", "true");
      expect(nameInput()).toHaveAccessibleDescription(
        `Nome e sobrenome de quem está fazendo o cadastro. ${message}`,
      );
      expect(nameInput()).toHaveFocus();
    },
  );

  it.each([
    ["", "Informe o CNPJ da empresa."],
    ["12ABC", "O CNPJ tem 14 caracteres. Confira se falta algum."],
  ])(
    "AC 6: submitting the CNPJ %j shows its error, linked, with focus on the field",
    async (cnpj, message) => {
      const user = userEvent.setup();
      render(<VerificationForm slug="loja-exemplo" />);

      if (cnpj) await user.type(cnpjInput(), cnpj);
      await user.type(nameInput(), "Maria Exemplo");
      await user.click(submit());

      expect(cnpjInput()).toHaveAttribute("aria-invalid", "true");
      expect(cnpjInput()).toHaveAccessibleDescription(
        `CNPJs novos podem ter letras. ${message}`,
      );
      expect(cnpjInput()).toHaveFocus();
    },
  );

  it("AC 11: with both fields invalid, both errors show and focus goes to the CNPJ first", async () => {
    const user = userEvent.setup();
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "12");
    await user.type(nameInput(), "Maria");
    await user.click(submit());

    expect(cnpjInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(cnpjInput()).toHaveFocus();
  });

  it("clears a field's submit error once it's edited", async () => {
    const user = userEvent.setup();
    render(<VerificationForm slug="loja-exemplo" />);

    await user.click(submit());
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");

    await user.type(nameInput(), "M");

    expect(nameInput()).not.toHaveAttribute("aria-invalid");
  });
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = "tokaprovado0000000000000";

async function fillValidForm(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(cnpjInput(), "12abc34501de35");
  await user.type(nameInput(), "Maria Exemplo");
}

describe("VerificationForm: submit", () => {
  beforeEach(() => {
    lookup.mockResolvedValue({ ok: false, reason: "not_found" });
  });

  it("AC 12: sends the canonical CNPJ, the name, the passthrough and a UUID key, then opens the case", async () => {
    const user = userEvent.setup();
    start.mockResolvedValue({ ok: true, token: TOKEN });
    render(
      <VerificationForm
        slug="loja-exemplo"
        passthrough={{ ref: "onboarding", ext_id: "SELLER-42" }}
      />,
    );

    await fillValidForm(user);
    await user.click(submit());

    await vi.waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/v/loja-exemplo/c/${TOKEN}`),
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      slug: "loja-exemplo",
      idempotencyKey: expect.stringMatching(UUID),
      cnpj: "12ABC34501DE35",
      responsavel: "Maria Exemplo",
      ref: "onboarding",
      ext_id: "SELLER-42",
    });
  });

  it("AC 12: a double tap sends one request, and the button stays busy at its width", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: true; token: string }>();
    start.mockReturnValue(pending.promise);
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.dblClick(submit());

    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviando…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => pending.resolve({ ok: true, token: TOKEN }));
  });

  it("AC 13: offline shows the network alert, keeps the values, and retries with the same key", async () => {
    const user = userEvent.setup();
    start.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    start.mockResolvedValueOnce({ ok: true, token: TOKEN });
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.click(submit());

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos enviar. Confira sua conexão e tente de novo.",
      ),
    );
    expect(cnpjInput()).toHaveValue("12.ABC.345/01DE-35");
    expect(nameInput()).toHaveValue("Maria Exemplo");

    await user.click(submit());
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    const keys = start.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[1]).toBe(keys[0]);
  });

  it("F17: a changed input gets a new idempotency key", async () => {
    const user = userEvent.setup();
    start.mockResolvedValue({ ok: false, reason: "failed" });
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.click(submit());
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await user.type(nameInput(), " Silva");
    await user.click(submit());
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));

    const keys = start.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it.each([
    [
      "limit_cnpj",
      "Esse CNPJ já foi verificado várias vezes na última hora. Tente de novo em 9 min.",
    ],
    ["limit_generic", "Muitas tentativas seguidas. Tente de novo em 9 min."],
  ] as const)(
    "AC 14: %s shows its alert with the minutes from Retry-After",
    async (reason, message) => {
      const user = userEvent.setup();
      start.mockResolvedValue({ ok: false, reason, retryAfterSeconds: 540 });
      render(<VerificationForm slug="loja-exemplo" />);

      await fillValidForm(user);
      await user.click(submit());

      await vi.waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(message),
      );
    },
  );

  it("maps any other failure to the network alert (plan § 1.5)", async () => {
    const user = userEvent.setup();
    start.mockResolvedValue({ ok: false, reason: "failed" });
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.click(submit());

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos enviar. Confira sua conexão e tente de novo.",
      ),
    );
  });

  it("AC 14: a link disabled at submit time refreshes the page into Link not found", async () => {
    const user = userEvent.setup();
    start.mockResolvedValue({ ok: false, reason: "link_not_found" });
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.click(submit());

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows field issues the server found, and focuses the first", async () => {
    const user = userEvent.setup();
    start.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fields: { responsavel: "single" },
    });
    render(<VerificationForm slug="loja-exemplo" />);

    await fillValidForm(user);
    await user.click(submit());

    await vi.waitFor(() =>
      expect(nameInput()).toHaveAttribute("aria-invalid", "true"),
    );
    expect(nameInput()).toHaveFocus();
  });

  it("AC 11: sends nothing while a field is invalid", async () => {
    const user = userEvent.setup();
    render(<VerificationForm slug="loja-exemplo" />);

    await user.type(cnpjInput(), "12ABC");
    await user.click(submit());

    expect(start).not.toHaveBeenCalled();
  });
});
