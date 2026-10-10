import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PolicyForm } from "@/features/panel-regras/components/policy-form";
import type { Policy } from "@/lib/api/schemas/panel/policies";

// T144 (AC 59 first half, plan-m8 D8): the rules in the spec's order with
// their descriptions, the action selects limited to acoes_permitidas, the
// days input, the document switches, the save bar only while dirty,
// Descartar, and the nodocs validation. No simulation (Non-Goal 4).

const POLICY: Policy = {
  versao: 1,
  regras: [
    { chave: "ok", acao: "auto", acoes_permitidas: ["auto", "review"] },
    {
      chave: "situacao",
      acao: "block",
      acoes_permitidas: ["review", "block"],
    },
    {
      chave: "recente",
      acao: "review",
      acoes_permitidas: ["review", "request", "block"],
      dias: 90,
    },
    {
      chave: "qsa",
      acao: "request",
      acoes_permitidas: ["review", "request"],
    },
    { chave: "cnae", acao: "review", acoes_permitidas: ["review", "block"] },
    { chave: "ie", acao: "review", acoes_permitidas: ["approve", "review"] },
    {
      chave: "mei",
      acao: "approve_limit",
      acoes_permitidas: ["approve", "approve_limit", "review"],
    },
  ],
  documentos_habilitados: ["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"],
};

const NODOCS = 'Ative pelo menos um documento para usar "Pedir documento".';

function renderForm(policy: Policy = POLICY) {
  return render(
    <PolicyForm
      policy={policy}
      categoria={{ nome: "Moda e acessórios", descricao: "Lojas de roupa" }}
    />,
  );
}

const selects = () => screen.getAllByRole("combobox");
const saveBar = () => screen.queryByRole("region", { name: "Salvar regras" });

describe("PolicyForm", () => {
  it("the lead with the category; the rules in the spec's order, Tudo certo last, with descriptions", () => {
    renderForm();
    expect(
      screen.getByText(
        "O que acontece com cada resultado para Moda e acessórios.",
      ),
    ).toBeTruthy();
    expect(
      selects().map(
        (select) => (select as HTMLSelectElement).labels[0]?.textContent,
      ),
    ).toEqual([
      "Empresa inapta, baixada ou suspensa",
      "Aberta há menos de 90 dias",
      "Responsável não consta no quadro de sócios",
      "CNAE fora da categoria",
      "Sem inscrição estadual",
      "MEI",
      "Tudo certo",
    ]);
    expect(screen.getByText("Situação na Receita Federal")).toBeTruthy();
    expect(screen.getByText("Lojas de roupa")).toBeTruthy();
    expect(screen.queryByText(/simula/i)).toBeNull();
  });

  it("each select offers only the rule's acoes_permitidas", () => {
    renderForm();
    const mei = screen.getByRole("combobox", { name: "MEI" });
    expect(
      within(mei)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Aprovar", "Aprovar com limite", "Revisar"]);
    expect(mei).toHaveValue("approve_limit");
  });

  it("recente's days input, labelled; the rule's title follows it", () => {
    renderForm();
    const days = screen.getByRole("textbox", {
      name: "Prazo mínimo de abertura",
    });
    expect(days).toHaveValue("90");
    fireEvent.change(days, { target: { value: "120" } });
    expect(
      screen.getByRole("combobox", { name: "Aberta há menos de 120 dias" }),
    ).toBeTruthy();
  });

  it("the documents card: one switch per type, on for the enabled ones", () => {
    renderForm();
    expect(
      screen.getByRole("heading", { name: "Documentos que o link pode pedir" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Cartão CNPJ atualizado" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Procuração do responsável" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("no save bar until the draft differs; reverting hides it again", () => {
    renderForm();
    expect(saveBar()).toBeNull();
    const situacao = screen.getByRole("combobox", {
      name: "Empresa inapta, baixada ou suspensa",
    });
    fireEvent.change(situacao, { target: { value: "review" } });
    const bar = saveBar();
    expect(bar).toBeTruthy();
    expect(bar).toHaveTextContent(
      "As regras novas valem para as próximas verificações.",
    );
    fireEvent.change(situacao, { target: { value: "block" } });
    expect(saveBar()).toBeNull();
  });

  it("Descartar restores the server copy", () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("switch", { name: "Procuração do responsável" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "MEI" }), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(saveBar()).toBeNull();
    expect(screen.getByRole("combobox", { name: "MEI" })).toHaveValue(
      "approve_limit",
    );
    expect(
      screen.getByRole("switch", { name: "Procuração do responsável" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("Pedir documento with no document: nodocs beside the card and the rule, the save blocked, focus on the rule", () => {
    renderForm();
    for (const name of ["Contrato social ou CCMEI", "Cartão CNPJ atualizado"])
      fireEvent.click(screen.getByRole("switch", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    const qsa = screen.getByRole("combobox", {
      name: "Responsável não consta no quadro de sócios",
    });
    expect(qsa).toHaveFocus();
    expect(qsa).toHaveAccessibleDescription(expect.stringContaining(NODOCS));
    const card = screen
      .getByRole("heading", { name: "Documentos que o link pode pedir" })
      .closest("section");
    expect(card).toHaveTextContent(NODOCS);
    for (const toggle of within(card as HTMLElement).getAllByRole("switch"))
      expect(toggle).toHaveAccessibleDescription(NODOCS);
  });

  it("an invalid number of days blocks the save with focus on it", () => {
    renderForm();
    const days = screen.getByRole("textbox", {
      name: "Prazo mínimo de abertura",
    });
    fireEvent.change(days, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    expect(days).toHaveFocus();
  });
});
