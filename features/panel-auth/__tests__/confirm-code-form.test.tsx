import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  confirmEmailAction: vi.fn(),
  resendCodeAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const turnstile = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/features/panel-auth/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/panel-auth/components/turnstile", () => ({
  Turnstile: (props: Record<string, unknown>) => {
    turnstile.props = props;
    return <div data-testid="turnstile-widget" />;
  },
}));

import { ConfirmCodeForm } from "@/features/panel-auth/components/confirm-code-form";

function renderForm(availableInMs = 0) {
  render(
    <ConfirmCodeForm
      email="p@exemplo.test"
      resendAvailableInMs={availableInMs}
      turnstileSiteKey="k"
      nonce="n"
    />,
  );
  return screen.getByLabelText("Código");
}

async function confirm(code: string) {
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: code },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfirmCodeForm (S2, AC 3)", () => {
  it("one numeric field with one-time-code autofill", () => {
    const field = renderForm();

    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
  });

  it("accepts a pasted code with spaces and other separators stripped", async () => {
    actions.confirmEmailAction.mockResolvedValue({
      ok: true,
      next: "/comecar",
    });
    renderForm();
    await confirm(" 123 456 ");

    expect(screen.getByLabelText("Código")).toHaveValue("123456");
    expect(actions.confirmEmailAction).toHaveBeenCalledWith({
      codigo: "123456",
    });
    expect(router.push).toHaveBeenCalledWith("/comecar");
  });

  it.each([
    [
      { ok: false, code: "CODIGO_INCORRETO" },
      "Código incorreto. Confira o e-mail e tente de novo.",
    ],
    [
      { ok: false, code: "CODIGO_EXPIRADO" },
      'Este código não vale mais. Use "Reenviar código" para receber um novo.',
    ],
    [
      { ok: false, code: "LIMITE_TENTATIVAS", retryAfterSeconds: 120 },
      "Tente de novo em 2 min.",
    ],
    [{ ok: false, code: "NETWORK" }, "Não conseguimos falar com o servidor."],
  ])("%j → %s, focus back on the field", async (result, text) => {
    actions.confirmEmailAction.mockResolvedValue(result);
    renderForm();
    await confirm("000000");

    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText("Código")).toHaveFocus();
  });

  it("an incomplete code shows confirm.error.wrong with no request", async () => {
    renderForm();
    await confirm("123");

    expect(actions.confirmEmailAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Código incorreto.");
  });

  it("without a pending sign-up, goes back to /cadastro", async () => {
    actions.confirmEmailAction.mockResolvedValue({
      ok: false,
      code: "SEM_CADASTRO",
    });
    renderForm();
    await confirm("123456");

    expect(router.push).toHaveBeenCalledWith("/cadastro");
  });

  it("resend: carries the Turnstile token, announces confirm.resent politely, and restarts the countdown", async () => {
    actions.resendCodeAction.mockResolvedValue({
      ok: true,
      resendInMs: 60_000,
    });
    renderForm(0);
    act(() => (turnstile.props?.onToken as (t: string) => void)("tok"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
    });

    expect(actions.resendCodeAction).toHaveBeenCalledWith({ turnstile: "tok" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Código reenviado para p@exemplo.test.",
    );
    expect(
      screen.getByRole("button", { name: "Reenviar em 60 s" }),
    ).toBeDisabled();
  });

  it("resend without a token (the check failed) shows auth.error.turnstile, no request", async () => {
    renderForm(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
    });

    expect(actions.resendCodeAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "verificação de segurança",
    );
  });
});
