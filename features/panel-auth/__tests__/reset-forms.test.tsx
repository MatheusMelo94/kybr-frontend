import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  requestPasswordResetAction: vi.fn(),
  resetPasswordAction: vi.fn(),
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

import { NewPasswordForm } from "@/features/panel-auth/components/new-password-form";
import { ResetRequestForm } from "@/features/panel-auth/components/reset-request-form";

const TOKEN = "TOKEN_sintetico_0123456789abcdef";

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/senha/nova");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ResetRequestForm (S3 Recuperar, AC 6)", () => {
  function fillEmail(value: string): void {
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value } });
  }

  it("sends the e-mail and the Turnstile token; says reset.sent with {email} and 1 h", async () => {
    actions.requestPasswordResetAction.mockResolvedValue({ ok: true });
    render(<ResetRequestForm turnstileSiteKey="k" nonce="n" />);
    act(() => (turnstile.props?.onToken as (t: string) => void)("tok"));
    fillEmail("renata@exemplo.test");
    await click("Enviar link");

    expect(actions.requestPasswordResetAction).toHaveBeenCalledWith({
      email: "renata@exemplo.test",
      turnstile: "tok",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Se existir uma conta com renata@exemplo.test, o link chega em alguns minutos. Ele vale por 1 h.",
    );
  });

  it("an invalid e-mail is a field error, with no request", async () => {
    render(<ResetRequestForm turnstileSiteKey="k" nonce="n" />);
    fillEmail("x");
    await click("Enviar link");

    expect(screen.getByLabelText("E-mail")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("E-mail")).toHaveFocus();
    expect(actions.requestPasswordResetAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      { ok: false, code: "LIMITE_TENTATIVAS", retryAfterSeconds: 540 },
      "Tente de novo em 9 min.",
    ],
    [{ ok: false, code: "TURNSTILE_INVALIDO" }, "verificação de segurança"],
    [{ ok: false, code: "NETWORK" }, "Não conseguimos falar com o servidor."],
  ])("%j → %s", async (result, text) => {
    actions.requestPasswordResetAction.mockResolvedValue(result);
    render(<ResetRequestForm turnstileSiteKey="k" nonce="n" />);
    act(() => (turnstile.props?.onToken as (t: string) => void)("tok"));
    fillEmail("renata@exemplo.test");
    await click("Enviar link");

    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });
});

describe("NewPasswordForm (S3 Nova senha, P04)", () => {
  it("reads the token from the fragment and drops it from the URL at once", async () => {
    window.history.replaceState(null, "", `/senha/nova#t=${TOKEN}`);
    actions.resetPasswordAction.mockResolvedValue({ ok: true });
    render(<NewPasswordForm />);

    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/senha/nova");
    const field = screen.getByLabelText("Senha nova");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    expect(field).toHaveAccessibleDescription("Pelo menos 12 caracteres.");
    fireEvent.change(field, { target: { value: "uma-senha-nova-1" } });
    await click("Salvar senha");

    expect(actions.resetPasswordAction).toHaveBeenCalledWith({
      token: TOKEN,
      senha: "uma-senha-nova-1",
    });
    expect(router.push).toHaveBeenCalledWith("/entrar?motivo=senha-nova");
  });

  it("without a fragment: reset.error.expired and Pedir outro link", () => {
    render(<NewPasswordForm />);

    expect(
      screen.getByText("Este link expirou ou já foi usado."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Pedir outro link" }),
    ).toHaveAttribute("href", "/senha/esqueci");
    expect(screen.queryByLabelText("Senha nova")).not.toBeInTheDocument();
  });

  it("an expired or used token (TOKEN_INVALIDO) switches to the same state", async () => {
    window.history.replaceState(null, "", `/senha/nova#t=${TOKEN}`);
    actions.resetPasswordAction.mockResolvedValue({
      ok: false,
      code: "TOKEN_INVALIDO",
    });
    render(<NewPasswordForm />);
    fireEvent.change(screen.getByLabelText("Senha nova"), {
      target: { value: "uma-senha-nova-1" },
    });
    await click("Salvar senha");

    expect(
      screen.getByRole("link", { name: "Pedir outro link" }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "curta",
      { ok: false, code: "SENHA_CURTA" },
      "A senha precisa ter pelo menos 12 caracteres.",
    ],
    [
      "uma-senha-nova-1",
      { ok: false, code: "SENHA_FRACA" },
      "Esta senha aparece em vazamentos de dados conhecidos.",
    ],
  ])("%s → the field says %s", async (senha, result, text) => {
    window.history.replaceState(null, "", `/senha/nova#t=${TOKEN}`);
    actions.resetPasswordAction.mockResolvedValue(result);
    render(<NewPasswordForm />);
    fireEvent.change(screen.getByLabelText("Senha nova"), {
      target: { value: senha },
    });
    await click("Salvar senha");

    expect(screen.getByLabelText("Senha nova")).toHaveAccessibleDescription(
      new RegExp(text.replace(/\./g, "\\.")),
    );
    expect(screen.getByLabelText("Senha nova")).toHaveFocus();
  });
});
