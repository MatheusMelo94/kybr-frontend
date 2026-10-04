import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loginAction = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const turnstile = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/features/panel-auth/actions", () => ({ loginAction }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/panel-auth/components/turnstile", () => ({
  Turnstile: (props: Record<string, unknown>) => {
    turnstile.props = props;
    return <div data-testid="turnstile-widget" />;
  },
}));

import { LoginForm } from "@/features/panel-auth/components/login-form";

function renderForm(volta: string | null = null) {
  render(
    <LoginForm
      volta={volta}
      turnstileSiteKey="1x00000000000000000000AA"
      nonce="n"
    />,
  );
  const email = screen.getByLabelText("E-mail");
  const senha = screen.getByLabelText("Senha");
  return { email, senha };
}

async function submit(
  email: HTMLElement,
  senha: HTMLElement,
  values = ["renata@exemplo.test", "segredo-123"],
) {
  fireEvent.change(email, { target: { value: values[0] } });
  fireEvent.change(senha, { target: { value: values[1] } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  turnstile.props = undefined;
});

describe("LoginForm (S3, AC 5)", () => {
  it("has visibly labeled e-mail and password fields with autocomplete for password managers", () => {
    const { email, senha } = renderForm();

    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAttribute("type", "email");
    expect(senha).toHaveAttribute("autocomplete", "current-password");
    expect(senha).toHaveAttribute("type", "password");
    expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();
  });

  it("sends e-mail, password and volta, then goes where the action says", async () => {
    loginAction.mockResolvedValue({ ok: true, next: "/fila" });
    const { email, senha } = renderForm("/fila");
    await submit(email, senha);

    expect(loginAction).toHaveBeenCalledWith({
      email: "renata@exemplo.test",
      senha: "segredo-123",
      volta: "/fila",
    });
    expect(router.push).toHaveBeenCalledWith("/fila");
  });

  it("wrong credentials: one message naming no field, focus to the e-mail field", async () => {
    loginAction.mockResolvedValue({ ok: false, code: "CREDENCIAIS_INVALIDAS" });
    const { email, senha } = renderForm();
    await submit(email, senha);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos.",
    );
    expect(email).toHaveFocus();
    expect(email).not.toHaveAttribute("aria-invalid");
  });

  it("empty fields show the same message, with no action call", async () => {
    const { email, senha } = renderForm();
    await submit(email, senha, ["", ""]);

    expect(loginAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos.",
    );
    expect(email).toHaveFocus();
  });

  it("TURNSTILE_REQUERIDO: shows the extra check, and the next submit carries its token", async () => {
    loginAction.mockResolvedValueOnce({
      ok: false,
      code: "TURNSTILE_REQUERIDO",
    });
    const { email, senha } = renderForm();
    await submit(email, senha);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Depois de algumas tentativas, pedimos uma verificação extra.",
    );
    expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();

    act(() => (turnstile.props?.onToken as (t: string) => void)("tok-1"));
    loginAction.mockResolvedValueOnce({ ok: true, next: "/" });
    await submit(email, senha);
    expect(loginAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ turnstile: "tok-1" }),
    );
  });

  it("a failed check (TURNSTILE_INVALIDO or a widget error) shows auth.error.turnstile + hint; submit stays enabled", async () => {
    loginAction.mockResolvedValueOnce({
      ok: false,
      code: "TURNSTILE_REQUERIDO",
    });
    const { email, senha } = renderForm();
    await submit(email, senha);
    loginAction.mockResolvedValueOnce({
      ok: false,
      code: "TURNSTILE_INVALIDO",
    });
    await submit(email, senha);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Não conseguimos fazer a verificação de segurança. Tente de novo.",
    );
    expect(alert).toHaveTextContent("desative bloqueadores de anúncio");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    const resetKey = turnstile.props?.resetKey as number;

    act(() => (turnstile.props?.onError as () => void)());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "verificação de segurança",
    );
    expect(resetKey).toBeGreaterThan(0);
  });

  it("429: the minutes from Retry-After", async () => {
    loginAction.mockResolvedValue({
      ok: false,
      code: "LIMITE_TENTATIVAS",
      retryAfterSeconds: 540,
    });
    const { email, senha } = renderForm();
    await submit(email, senha);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tente de novo em 9 min.",
    );
  });

  it("unconfirmed: goes to S2", async () => {
    loginAction.mockResolvedValue({
      ok: false,
      code: "EMAIL_NAO_CONFIRMADO",
      next: "/cadastro/confirmar?origem=login",
    });
    const { email, senha } = renderForm();
    await submit(email, senha);

    expect(router.push).toHaveBeenCalledWith(
      "/cadastro/confirmar?origem=login",
    );
  });

  it.each([
    [
      "a NETWORK result",
      () => loginAction.mockResolvedValue({ ok: false, code: "NETWORK" }),
    ],
    [
      "an unreachable action",
      () => loginAction.mockRejectedValue(new TypeError("fetch failed")),
    ],
  ])("%s shows error.network and keeps the values", async (_, arrange) => {
    arrange();
    const { email, senha } = renderForm();
    await submit(email, senha);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor.",
    );
    expect(email).toHaveValue("renata@exemplo.test");
    expect(senha).toHaveValue("segredo-123");
  });

  it("is busy while submitting (login.submit.busy), ignoring a second press", async () => {
    let resolve: (value: unknown) => void = () => {};
    loginAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const { email, senha } = renderForm();
    await submit(email, senha);
    const button = screen.getByRole("button", { name: "Entrando…" });
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(loginAction).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve({ ok: false, code: "CREDENCIAIS_INVALIDAS" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Entrar" }),
      ).not.toHaveAttribute("aria-busy"),
    );
  });
});
