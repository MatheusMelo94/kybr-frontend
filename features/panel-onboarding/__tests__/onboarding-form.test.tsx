import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveOnboardingAction = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/features/panel-onboarding/actions", () => ({
  saveOnboardingAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OnboardingForm } from "@/features/panel-onboarding/components/onboarding-form";

const CATEGORIES = [
  {
    id: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e01",
    nome: "Lojas de peças",
    descricao: "Vendem peças e acessórios.",
  },
  {
    id: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e02",
    nome: "Oficinas e serviços",
    descricao: "Prestam serviços.",
  },
];

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingForm (S4, AC 4)", () => {
  it("the contact choice switches the value field; the categories are a radio list", () => {
    render(<OnboardingForm categories={CATEGORIES} />);

    expect(
      screen.getByRole("radiogroup", { name: "Canal de contato" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "E-mail" })).toBeChecked();
    expect(screen.getByLabelText("E-mail para vendedores")).toHaveAttribute(
      "type",
      "email",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Página de ajuda" }));
    const url = screen.getByLabelText("Endereço da página de ajuda");
    expect(url).toHaveAccessibleDescription("Começa com https://");
    expect(
      screen.queryByLabelText("E-mail para vendedores"),
    ).not.toBeInTheDocument();

    const categories = screen.getByRole("radiogroup", {
      name: "Que tipo de vendedor vocês cadastram?",
    });
    expect(categories).toHaveAccessibleDescription(
      "Define as regras de aprovação. Dá para ajustar depois.",
    );
    expect(
      screen.getByRole("radio", { name: "Lojas de peças" }),
    ).toHaveAccessibleDescription(/Vendem peças/);
  });

  it("invalid e-mail and no category: onb.error.*, focus on the first", async () => {
    render(<OnboardingForm categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText("E-mail para vendedores"), {
      target: { value: "x" },
    });
    await submit();

    expect(
      screen.getByLabelText("E-mail para vendedores"),
    ).toHaveAccessibleDescription("Informe um e-mail válido.");
    expect(screen.getByLabelText("E-mail para vendedores")).toHaveFocus();
    expect(
      screen.getByText("Escolha um tipo de vendedor."),
    ).toBeInTheDocument();
    expect(saveOnboardingAction).not.toHaveBeenCalled();
  });

  it("a non-https URL: onb.error.url", async () => {
    render(<OnboardingForm categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("radio", { name: "Página de ajuda" }));
    fireEvent.change(screen.getByLabelText("Endereço da página de ajuda"), {
      target: { value: "http://x.co" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Oficinas e serviços" }));
    await submit();

    expect(
      screen.getByLabelText("Endereço da página de ajuda"),
    ).toHaveAccessibleDescription(
      "Começa com https:// Informe um endereço que comece com https://.",
    );
  });

  it("saves, busy, then goes where the action says", async () => {
    saveOnboardingAction.mockResolvedValue({ ok: true, next: "/fila" });
    render(<OnboardingForm categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText("E-mail para vendedores"), {
      target: { value: "suporte@exemplo.test" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Lojas de peças" }));
    await submit();

    expect(saveOnboardingAction).toHaveBeenCalledWith({
      contato_vendedor: { tipo: "email", valor: "suporte@exemplo.test" },
      categoria: CATEGORIES[0]?.id,
    });
    expect(router.push).toHaveBeenCalledWith("/fila");
  });

  it.each([[{ ok: false, code: "NETWORK" }], ["throw"]])(
    "%j → error.network, values kept",
    async (result) => {
      if (result === "throw")
        saveOnboardingAction.mockRejectedValue(new TypeError("fetch failed"));
      else saveOnboardingAction.mockResolvedValue(result);
      render(<OnboardingForm categories={CATEGORIES} />);
      fireEvent.change(screen.getByLabelText("E-mail para vendedores"), {
        target: { value: "suporte@exemplo.test" },
      });
      fireEvent.click(screen.getByRole("radio", { name: "Lojas de peças" }));
      await submit();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos falar com o servidor.",
      );
      expect(screen.getByLabelText("E-mail para vendedores")).toHaveValue(
        "suporte@exemplo.test",
      );
      expect(
        screen.getByRole("radio", { name: "Lojas de peças" }),
      ).toBeChecked();
    },
  );

  it("an expired session goes to /entrar with the way back", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/comecar",
      search: "",
      assign,
    });
    saveOnboardingAction.mockResolvedValue({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    render(<OnboardingForm categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText("E-mail para vendedores"), {
      target: { value: "suporte@exemplo.test" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Lojas de peças" }));
    await submit();

    expect(assign).toHaveBeenCalledWith(
      "/entrar?motivo=sessao&volta=%2Fcomecar",
    );
  });
});
