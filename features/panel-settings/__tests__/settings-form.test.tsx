import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { SettingsForm } from "@/features/panel-settings/components/settings-form";

// T135 (AC 60 save half): the Configurações form, enabled only when dirty,
// busy while saving, toast on success, error.network inline with the values
// kept, field errors from the onboarding/signup keys with focus to the first.

const save = vi.fn();
vi.mock("@/features/panel-settings/actions", () => ({
  saveSettingsAction: (input: unknown) => save(input),
}));
const expire = vi.fn();
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));
const draft = vi.fn();
vi.mock("@/features/panel-shell/components/session-expiry-provider", () => ({
  useDialogDraft: (dirty: boolean) => draft(dirty),
}));

const INITIAL = {
  nome_plataforma: "Loja Exemplo",
  contato_vendedor: { tipo: "email" as const, valor: "ajuda@exemplo.test" },
  nome: "Renata Exemplo",
  email: "renata@exemplo.test",
};

function view(): JSX.Element {
  return (
    <ToastProvider closeLabel="Fechar">
      <SettingsForm initial={INITIAL} link={<p>link slot</p>} />
    </ToastProvider>
  );
}

const saveButton = () =>
  screen.getByRole("button", { name: "Salvar alterações" });
const platformName = () =>
  screen.getByRole("textbox", { name: "Nome da plataforma" });

beforeEach(() => {
  save.mockReset();
  expire.mockReset();
  draft.mockReset();
});

describe("SettingsForm (T135, AC 60)", () => {
  it("shows Plataforma, the link slot and Conta, prefilled; the login e-mail is read-only text", () => {
    render(view());
    expect(
      screen.getByRole("heading", { level: 2, name: "Plataforma" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Conta" }),
    ).toBeInTheDocument();
    expect(screen.getByText("link slot")).toBeInTheDocument();
    expect(platformName()).toHaveValue("Loja Exemplo");
    expect(platformName()).toHaveAccessibleDescription(
      "Aparece no link de cadastro.",
    );
    expect(screen.getByRole("radio", { name: "E-mail" })).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "E-mail para vendedores" }),
    ).toHaveValue("ajuda@exemplo.test");
    expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveValue(
      "Renata Exemplo",
    );
    expect(screen.getByText("renata@exemplo.test")).toBeInTheDocument();
    expect(
      screen.getByText("Para trocar o e-mail de login, fale com a gente."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "E-mail de login" }),
    ).not.toBeInTheDocument();
  });

  it("enables the save only when dirty, and reports the draft", async () => {
    render(view());
    expect(saveButton()).toBeDisabled();
    expect(draft).toHaveBeenLastCalledWith(false);
    await userEvent.type(platformName(), " Nova");
    expect(saveButton()).toBeEnabled();
    expect(draft).toHaveBeenLastCalledWith(true);
    await userEvent.clear(platformName());
    await userEvent.type(platformName(), "Loja Exemplo");
    expect(saveButton()).toBeDisabled();
  });

  it("saves the trimmed values, is busy meanwhile, then toasts and is clean again", async () => {
    let resolve: (value: { ok: true }) => void = () => undefined;
    save.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(view());
    await userEvent.clear(platformName());
    await userEvent.type(platformName(), "  Loja Nova  ");
    await userEvent.click(saveButton());
    expect(save).toHaveBeenCalledWith({
      nome_plataforma: "Loja Nova",
      contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
      nome: "Renata Exemplo",
    });
    expect(saveButton()).toHaveAttribute("aria-busy", "true");
    resolve({ ok: true });
    await waitFor(() =>
      expect(screen.getByText("Alterações salvas")).toBeInTheDocument(),
    );
    expect(saveButton()).toBeDisabled();
    expect(draft).toHaveBeenLastCalledWith(false);
  });

  it("a failure shows error.network inline and keeps the values", async () => {
    save.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    render(view());
    await userEvent.type(platformName(), " Nova");
    await userEvent.click(saveButton());
    const form = screen.getByRole("form", { name: "Configurações" });
    await waitFor(() =>
      expect(within(form).getByRole("alert")).toHaveTextContent(
        "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
      ),
    );
    expect(platformName()).toHaveValue("Loja Exemplo Nova");
    expect(saveButton()).toBeEnabled();
  });

  it("client validation: the field errors and focus to the first; nothing sent", async () => {
    render(view());
    await userEvent.clear(platformName());
    await userEvent.click(
      screen.getByRole("radio", { name: "Página de ajuda" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Endereço da página de ajuda" }),
      "javascript:alert(1)",
    );
    await userEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(platformName()).toHaveAccessibleDescription(
      expect.stringContaining("Informe o nome da plataforma."),
    );
    expect(
      screen.getByRole("textbox", { name: "Endereço da página de ajuda" }),
    ).toHaveAccessibleDescription(
      expect.stringContaining("Informe um endereço que comece com https://."),
    );
    expect(platformName()).toHaveFocus();
  });

  it("a server INVALID marks the field it names", async () => {
    save.mockResolvedValue({ ok: false, code: "INVALID", fields: ["nome"] });
    render(view());
    await userEvent.type(platformName(), " Nova");
    await userEvent.click(saveButton());
    const nome = screen.getByRole("textbox", { name: "Seu nome" });
    await waitFor(() =>
      expect(nome).toHaveAccessibleDescription("Informe seu nome."),
    );
    expect(nome).toHaveFocus();
  });

  it("SESSAO_EXPIRADA takes the session-expiry path", async () => {
    save.mockResolvedValue({ ok: false, code: "SESSAO_EXPIRADA" });
    render(view());
    await userEvent.type(platformName(), " Nova");
    await userEvent.click(saveButton());
    await waitFor(() => expect(expire).toHaveBeenCalledOnce());
  });
});
