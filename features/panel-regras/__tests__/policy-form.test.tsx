import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import type { SavePolicyResult } from "@/features/panel-regras/actions";
import { PolicyForm } from "@/features/panel-regras/components/policy-form";
import { REGRAS_H1_ID } from "@/features/panel-regras/ids";
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

const savePolicyAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-regras/actions", () => ({ savePolicyAction }));
const nav = vi.hoisted(() => ({ soft: vi.fn(), full: vi.fn() }));
vi.mock("@/lib/navigation/soft-navigate", () => ({
  useSoftNavigate: () => nav.soft,
  fullNavigate: nav.full,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// jsdom has no showModal()/close() (see dialog.test.tsx).
const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  proto.close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});
afterAll(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/regras");
});

const NODOCS = 'Ative pelo menos um documento para usar "Pedir documento".';

function renderForm(policy: Policy = POLICY) {
  return render(
    <ToastProvider closeLabel="Fechar">
      <a href="/fila">Fila de revisão</a>
      <h1 id={REGRAS_H1_ID} tabIndex={-1}>
        Regras
      </h1>
      <PolicyForm
        policy={policy}
        categoria={{ nome: "Moda e acessórios", descricao: "Lojas de roupa" }}
      />
    </ToastProvider>,
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

  it("P8-002: Descartar moves focus to the h1, never to <body>", () => {
    renderForm();
    editMei();
    const discard = screen.getByRole("button", { name: "Descartar" });
    discard.focus();
    fireEvent.click(discard);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
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

  it("an invalid number of days: regras.error.days on the field, the save blocked with focus on it", () => {
    renderForm();
    const days = screen.getByRole("textbox", {
      name: "Prazo mínimo de abertura",
    });
    fireEvent.change(days, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    expect(days).toHaveFocus();
    expect(days).toHaveAttribute("aria-invalid", "true");
    expect(days).toHaveAccessibleDescription(
      "Informe um número de dias entre 1 e 3650.",
    );
    expect(savePolicyAction).not.toHaveBeenCalled();
  });
});

const SAVE_ERROR =
  "Não conseguimos salvar as regras. Suas mudanças continuam aqui. Tente de novo.";
const CONFLICT =
  "As regras mudaram em outra aba. Recarregue a página para ver a versão atual.";

function editMei(value = "review"): void {
  fireEvent.change(screen.getByRole("combobox", { name: "MEI" }), {
    target: { value },
  });
}

async function save(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
  });
}

describe("PolicyForm: save, conflict and leaving (T145)", () => {
  it("busy, then toast.rules_saved and the bar disappears; the whole policy with versao", async () => {
    let finish: (result: SavePolicyResult) => void = () => {};
    savePolicyAction.mockReturnValue(
      new Promise<SavePolicyResult>((resolve) => {
        finish = resolve;
      }),
    );
    renderForm();
    editMei();
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    expect(
      within(saveBar() as HTMLElement).getByRole("button", { busy: true }),
    ).toBeTruthy();
    expect(savePolicyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        versao: 1,
        documentos_habilitados: ["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"],
        regras: expect.arrayContaining([{ chave: "mei", acao: "review" }]),
      }),
    );
    await act(async () => finish({ ok: true, versao: 2 }));
    expect(screen.getByText("Regras salvas")).toBeTruthy();
    expect(saveBar()).toBeNull();
    // The saved draft is the new server copy, with the new versao.
    savePolicyAction.mockResolvedValue({ ok: true, versao: 3 });
    editMei("approve");
    await save();
    expect(savePolicyAction.mock.calls[1]?.[0]).toMatchObject({ versao: 2 });
  });

  it("P8-004: the rules and switches are locked while a save is in flight", async () => {
    let finish: (result: SavePolicyResult) => void = () => {};
    savePolicyAction.mockReturnValue(
      new Promise<SavePolicyResult>((resolve) => {
        finish = resolve;
      }),
    );
    renderForm();
    editMei();
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    for (const select of selects()) expect(select).toBeDisabled();
    for (const toggle of screen.getAllByRole("switch"))
      expect(toggle).toBeDisabled();
    await act(async () => finish({ ok: true, versao: 2 }));
    for (const select of selects()) expect(select).toBeEnabled();
    for (const toggle of screen.getAllByRole("switch"))
      expect(toggle).toBeEnabled();
  });

  it("a failure: regras.save.error in the bar, the draft kept", async () => {
    savePolicyAction.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    renderForm();
    editMei();
    await save();
    expect(
      within(saveBar() as HTMLElement).getByRole("alert"),
    ).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole("combobox", { name: "MEI" })).toHaveValue("review");
  });

  it("409 (PR2): regras.save.conflict, never merged; the reload acts only when asked", async () => {
    savePolicyAction.mockResolvedValue({
      ok: false,
      code: "POLITICA_DESATUALIZADA",
    });
    renderForm();
    editMei();
    await save();
    const alert = within(saveBar() as HTMLElement).getByRole("alert");
    expect(alert).toHaveTextContent(CONFLICT);
    expect(screen.getByRole("combobox", { name: "MEI" })).toHaveValue("review");
    expect(nav.full).not.toHaveBeenCalled();
    fireEvent.click(within(alert).getByRole("button", { name: CONFLICT }));
    expect(nav.full).toHaveBeenCalledWith("/regras");
  });

  it("dirty + a nav link: regras.leave.*; Continuar editando stays, Sair sem salvar goes there", () => {
    renderForm();
    editMei();
    fireEvent.click(screen.getByText("Fila de revisão"));
    expect(
      screen.getByRole("heading", { name: "Sair sem salvar?", hidden: true }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continuar editando", hidden: true }),
    );
    expect(nav.soft).not.toHaveBeenCalled();
    expect(saveBar()).toBeTruthy();

    fireEvent.click(screen.getByText("Fila de revisão"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sair sem salvar", hidden: true }),
    );
    expect(nav.soft).toHaveBeenCalledWith("/fila", expect.anything());
  });

  it("a clean draft: links pass with no dialog", () => {
    renderForm();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    screen.getByText("Fila de revisão").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });
});
