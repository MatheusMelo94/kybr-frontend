import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { PasswordForm } from "@/features/panel-settings/components/password-form";

// T136 (AC 60 password half; Security O-F1, O-F2): Trocar senha.

const change = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-settings/actions", () => ({
  changePasswordAction: change,
}));
const expire = vi.fn();
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));
const draft = vi.fn();
vi.mock("@/features/panel-shell/components/session-expiry-provider", () => ({
  useDialogDraft: (dirty: boolean) => draft(dirty),
}));

const ATUAL = "senha-atual-sintetica";
const NOVA = "senha-nova-sintetica-1";

function view(): JSX.Element {
  return (
    <ToastProvider closeLabel="Fechar">
      <PasswordForm email="renata@exemplo.test" />
    </ToastProvider>
  );
}

const current = () => screen.getByLabelText("Senha atual");
const next = () => screen.getByLabelText("Senha nova");
const submit = () => screen.getByRole("button", { name: "Trocar senha" });

async function fill(atual = ATUAL, nova = NOVA): Promise<void> {
  await userEvent.type(current(), atual);
  await userEvent.type(next(), nova);
}

beforeEach(() => {
  change.mockReset();
  expire.mockReset();
  draft.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("PasswordForm (T136)", () => {
  // The pre-hydration POST is the E2E's (JS disabled): only SSR writes it.
  it("O-F2: the autocomplete hints and a hidden username", () => {
    const { container } = render(view());
    expect(current()).toHaveAttribute("autocomplete", "current-password");
    expect(current()).toHaveAttribute("type", "password");
    expect(next()).toHaveAttribute("autocomplete", "new-password");
    const username = container.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue("renata@exemplo.test");
    expect(username).not.toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Trocar senha" }),
    ).toBeInTheDocument();
  });

  it("sends the form's FormData once; success toasts and clears both fields", async () => {
    change.mockResolvedValue({ ok: true });
    render(view());
    await fill();
    await userEvent.click(submit());
    expect(change).toHaveBeenCalledOnce();
    const sent = change.mock.calls[0]?.[0] as FormData;
    expect(sent.get("senha_atual")).toBe(ATUAL);
    expect(sent.get("senha_nova")).toBe(NOVA);
    expect(await screen.findByText("Senha trocada")).toBeInTheDocument();
    expect(current()).toHaveValue("");
    expect(next()).toHaveValue("");
    // O-F2: never in the toast.
    expect(document.body.textContent).not.toContain(NOVA);
  });

  it("client: a new password under 12 is signup.error.password on the field, nothing sent", async () => {
    render(view());
    await fill(ATUAL, "curta");
    await userEvent.click(submit());
    expect(change).not.toHaveBeenCalled();
    expect(next()).toHaveAccessibleDescription(
      expect.stringContaining("A senha precisa ter pelo menos 12 caracteres."),
    );
    expect(next()).toHaveFocus();
  });

  it("O-F1: SENHA_ATUAL_INCORRETA → pwd.error.current on the current field, no expiry", async () => {
    change.mockResolvedValue({ ok: false, code: "SENHA_ATUAL_INCORRETA" });
    render(view());
    await fill();
    await userEvent.click(submit());
    await waitFor(() =>
      expect(current()).toHaveAccessibleDescription(
        "A senha atual não confere.",
      ),
    );
    expect(current()).toHaveFocus();
    expect(expire).not.toHaveBeenCalled();
  });

  it("SENHA_FRACA → auth.error.password_breached on the new field", async () => {
    change.mockResolvedValue({ ok: false, code: "SENHA_FRACA" });
    render(view());
    await fill();
    await userEvent.click(submit());
    await waitFor(() =>
      expect(next()).toHaveAccessibleDescription(
        expect.stringContaining("aparece em vazamentos"),
      ),
    );
  });

  it("O-F1: 429 → the rate-limit copy with the minutes; the button is disabled until Retry-After passes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    change.mockResolvedValue({
      ok: false,
      code: "LIMITE_TENTATIVAS",
      retryAfterSeconds: 120,
    });
    render(view());
    fireEvent.change(current(), { target: { value: ATUAL } });
    fireEvent.change(next(), { target: { value: NOVA } });
    await act(async () => {
      fireEvent.submit(submit().closest("form") as HTMLFormElement);
    });
    expect(
      screen.getByText("Muitas tentativas seguidas. Tente de novo em 2 min."),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    act(() => vi.advanceTimersByTime(120_000));
    expect(submit()).toBeEnabled();
  });

  it("O-F2: NETWORK (or a throw) → error.network, sent once, no auto-retry", async () => {
    change.mockRejectedValue(new Error("offline"));
    render(view());
    await fill();
    await userEvent.click(submit());
    expect(
      await screen.findByText(
        "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
      ),
    ).toBeInTheDocument();
    expect(change).toHaveBeenCalledOnce();
  });

  it("O-F2: SESSAO_EXPIRADA → the expiry path and both fields discarded", async () => {
    change.mockResolvedValue({ ok: false, code: "SESSAO_EXPIRADA" });
    render(view());
    await fill();
    await userEvent.click(submit());
    await waitFor(() => expect(expire).toHaveBeenCalledOnce());
    expect(current()).toHaveValue("");
    expect(next()).toHaveValue("");
  });

  it("O-F2: typing is a draft (a boolean), never a copy of the value", async () => {
    render(view());
    expect(draft).toHaveBeenLastCalledWith(false);
    await userEvent.type(current(), "x");
    expect(draft).toHaveBeenLastCalledWith(true);
    for (const call of draft.mock.calls) expect(typeof call[0]).toBe("boolean");
  });
});
