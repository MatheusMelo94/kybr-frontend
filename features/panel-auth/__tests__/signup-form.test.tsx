import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signupAction = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn() }));
const turnstile = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/features/panel-auth/actions", () => ({ signupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/panel-auth/components/turnstile", () => ({
  Turnstile: (props: Record<string, unknown>) => {
    turnstile.props = props;
    return <div data-testid="turnstile-widget" />;
  },
}));

import { SignupForm } from "@/features/panel-auth/components/signup-form";

type Props = Partial<Parameters<typeof SignupForm>[0]>;

function renderForm(props: Props = {}) {
  render(
    <SignupForm
      termsUrl="https://x.invalid/termos"
      privacyUrl="https://x.invalid/privacidade"
      turnstileSiteKey="k"
      nonce="n"
      commercialEmail={undefined}
      prefill={null}
      {...props}
    />,
  );
}

const field = (label: string): HTMLElement => screen.getByLabelText(label);

async function fillAll(): Promise<void> {
  fireEvent.change(field("Seu nome"), { target: { value: "Pessoa Exemplo" } });
  fireEvent.change(field("Nome da plataforma"), {
    target: { value: "Plataforma" },
  });
  fireEvent.change(field("E-mail de trabalho"), {
    target: { value: "pessoa@exemplo.test" },
  });
  fireEvent.change(field("Senha"), { target: { value: "senha-longa-123" } });
  fireEvent.click(screen.getByRole("checkbox"));
  act(() => (turnstile.props?.onToken as (t: string) => void)("tok"));
}

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignupForm (S1, AC 1, AC 2)", () => {
  it("has four visibly labeled fields, the terms with two new-tab links, the widget and Criar conta", () => {
    renderForm();

    expect(field("Seu nome")).toHaveAttribute("autocomplete", "name");
    expect(field("Nome da plataforma")).toHaveAccessibleDescription(
      "É o nome que os vendedores veem no link de cadastro.",
    );
    expect(field("E-mail de trabalho")).toHaveAttribute("type", "email");
    expect(field("Senha")).toHaveAttribute("autocomplete", "new-password");
    expect(field("Senha")).toHaveAccessibleDescription(
      "Pelo menos 12 caracteres.",
    );
    const terms = screen.getByRole("checkbox", {
      name: /Li e aceito os Termos de uso/,
    });
    expect(terms).toBeInTheDocument();
    for (const [name, href] of [
      ["Termos de uso (abre em outra aba)", "https://x.invalid/termos"],
      [
        "Política de privacidade (abre em outra aba)",
        "https://x.invalid/privacidade",
      ],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
  });

  it("submitting empty shows each field's error, bound to it, with focus on the first", async () => {
    renderForm();
    await submit();

    expect(field("Seu nome")).toHaveAccessibleDescription("Informe seu nome.");
    expect(field("Nome da plataforma")).toHaveAccessibleDescription(
      "É o nome que os vendedores veem no link de cadastro. Informe o nome da plataforma.",
    );
    expect(field("E-mail de trabalho")).toHaveAccessibleDescription(
      "Informe um e-mail válido, como nome@empresa.com.br.",
    );
    expect(field("Senha")).toHaveAccessibleDescription(
      "Pelo menos 12 caracteres. A senha precisa ter pelo menos 12 caracteres.",
    );
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
      "Para criar a conta, aceite os termos e a política de privacidade.",
    );
    expect(field("Seu nome")).toHaveFocus();
    expect(signupAction).not.toHaveBeenCalled();
  });

  it("validates a field on blur", () => {
    renderForm();
    fireEvent.change(field("E-mail de trabalho"), { target: { value: "x" } });
    fireEvent.blur(field("E-mail de trabalho"));

    expect(field("E-mail de trabalho")).toHaveAttribute("aria-invalid", "true");
  });

  it("without a Turnstile token (the script never loaded), submitting shows auth.error.turnstile, not a dead button", async () => {
    renderForm();
    fireEvent.change(field("Seu nome"), { target: { value: "Pessoa" } });
    fireEvent.change(field("Nome da plataforma"), { target: { value: "P" } });
    fireEvent.change(field("E-mail de trabalho"), {
      target: { value: "p@exemplo.test" },
    });
    fireEvent.change(field("Senha"), { target: { value: "senha-longa-123" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "verificação de segurança",
    );
    expect(signupAction).not.toHaveBeenCalled();
  });

  it("sends the values, the token and one Idempotency-Key reused on retry; success goes to /cadastro/confirmar", async () => {
    signupAction
      .mockResolvedValueOnce({ ok: false, code: "NETWORK" })
      .mockResolvedValueOnce({ ok: true });
    renderForm();
    await fillAll();
    await submit();
    act(() => (turnstile.props?.onToken as (t: string) => void)("tok-2"));
    await submit();

    const [first, second] = signupAction.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(first).toMatchObject({
      nome: "Pessoa Exemplo",
      workspace: "Plataforma",
      email: "pessoa@exemplo.test",
      senha: "senha-longa-123",
      aceite: true,
      turnstile: "tok",
    });
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(router.push).toHaveBeenCalledWith("/cadastro/confirmar");
    expect((turnstile.props?.resetKey as number) > 0).toBe(true);
  });

  it("EMAIL_EM_USO: the message with working Entrar and Recuperar senha links", async () => {
    signupAction.mockResolvedValue({ ok: false, code: "EMAIL_EM_USO" });
    renderForm();
    await fillAll();
    await submit();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
    );
    expect(within(alert).getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/entrar",
    );
    expect(
      within(alert).getByRole("link", { name: "Recuperar senha" }),
    ).toHaveAttribute("href", "/senha/esqueci");
  });

  it("SENHA_FRACA: auth.error.password_breached on the password field, focused", async () => {
    signupAction.mockResolvedValue({ ok: false, code: "SENHA_FRACA" });
    renderForm();
    await fillAll();
    await submit();

    expect(field("Senha")).toHaveAccessibleDescription(
      "Pelo menos 12 caracteres. Esta senha aparece em vazamentos de dados conhecidos. Escolha outra.",
    );
    expect(field("Senha")).toHaveFocus();
  });

  it.each([
    [
      { ok: false, code: "LIMITE_TENTATIVAS", retryAfterSeconds: 540 },
      "Tente de novo em 9 min.",
    ],
    [
      { ok: false, code: "TESTE_INDISPONIVEL" },
      "Não conseguimos liberar o teste grátis para este e-mail.",
    ],
    [
      { ok: false, code: "TESTE_PAUSADO" },
      "Os testes grátis estão pausados agora.",
    ],
    [
      { ok: false, code: "TURNSTILE_INVALIDO" },
      "Não conseguimos fazer a verificação de segurança.",
    ],
    [{ ok: false, code: "NETWORK" }, "Não conseguimos falar com o servidor."],
  ])("%j → the form alert says %s, values kept", async (result, text) => {
    signupAction.mockResolvedValue(result);
    renderForm();
    await fillAll();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(field("E-mail de trabalho")).toHaveValue("pessoa@exemplo.test");
    expect(field("Senha")).toHaveValue("senha-longa-123");
  });

  it("TESTE_INDISPONIVEL adds the commercial contact only when it's configured", async () => {
    signupAction.mockResolvedValue({ ok: false, code: "TESTE_INDISPONIVEL" });
    renderForm({ commercialEmail: "vendas@exemplo.test" });
    await fillAll();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Para contratar direto, escreva para vendas@exemplo.test.",
    );
  });

  it("refills from the pending sign-up, never the password", () => {
    renderForm({
      prefill: { nome: "Pessoa", workspace: "Plat", email: "p@exemplo.test" },
    });

    expect(field("Seu nome")).toHaveValue("Pessoa");
    expect(field("Nome da plataforma")).toHaveValue("Plat");
    expect(field("E-mail de trabalho")).toHaveValue("p@exemplo.test");
    expect(field("Senha")).toHaveValue("");
  });
});
