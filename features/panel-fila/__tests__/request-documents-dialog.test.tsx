import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import type { RequestDocumentsResult } from "@/features/panel-fila/actions";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { ConflictNotice } from "@/features/panel-fila/components/conflict-notice";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { RequestLinkPanel } from "@/features/panel-fila/components/request-link-panel";
import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";

const decideAction = vi.hoisted(() => vi.fn());
const requestDocumentsAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-fila/actions", () => ({
  decideAction,
  requestDocumentsAction,
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

const IDS = ["caso-a", "caso-b", "caso-c"];
const NETWORK_ERROR =
  "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";

let shell: ReturnType<typeof useShellStatus> | undefined;
function ShellProbe(): null {
  shell = useShellStatus();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  shell = undefined;
  window.history.replaceState(null, "", "/fila/caso-a?ate=50");
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

// G10's four, as the mock's /me sends them by default.
const TIPOS = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
] as const;

function Screen({
  caseId,
  renderedAt = 1,
  email = true,
  tipos = TIPOS,
}: {
  caseId: string;
  /** The layout's server render: a re-read moves it (T106, T111). */
  renderedAt?: number;
  email?: boolean;
  /** null: /me sent no documentos_habilitados. */
  tipos?: readonly (typeof TIPOS)[number][] | null;
}): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ShellProbe />
      <ToastProvider closeLabel="Fechar">
        <FilaProvider renderedAt={renderedAt}>
          <span id={FILA_TAB_ACTIVE_ID}>Para decidir (3)</span>
          <div key={caseId}>
            <CaseListbox
              aba="aberto"
              options={IDS.map((id) => ({ id, content: <span>{id}</span> }))}
              query="?ate=50"
              selectedId={caseId}
            />
            <DetailPane caseId={caseId}>
              <h2 data-detail-heading tabIndex={-1}>
                Caso {caseId}
              </h2>
              <ConflictNotice caseId={caseId} decididoEm={undefined} />
              <RequestLinkPanel caseId={caseId} link={undefined} />
              <CaseActions
                caseId={caseId}
                origem="link"
                razao={`Empresa ${caseId}`}
                webhook
                request={
                  tipos === null
                    ? undefined
                    : { tipos, vendedorTemEmail: email }
                }
              />
            </DetailPane>
          </div>
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

// An open call keeps React's transitions entangled (decide.test.tsx).
const open: ((result: RequestDocumentsResult) => void)[] = [];
afterEach(async () => {
  for (const resolve of open.splice(0)) resolve({ ok: false, code: "NETWORK" });
  await act(async () => new Promise((done) => setTimeout(done, 0)));
});

function deferred(): {
  promise: Promise<RequestDocumentsResult>;
  resolve: (result: RequestDocumentsResult) => void;
} {
  let resolve: (result: RequestDocumentsResult) => void = () => undefined;
  const promise = new Promise<RequestDocumentsResult>(
    (done) => (resolve = done),
  );
  open.push(resolve);
  return { promise, resolve };
}

const flush = () => act(async () => new Promise((done) => setTimeout(done, 0)));
const trigger = () => screen.getByRole("button", { name: "Pedir documento" });
const dialog = () => screen.queryByRole("dialog", { hidden: false });
const submit = () =>
  within(screen.getByRole("dialog")).getByRole("button", {
    name: /^(Pedir documento|Pedir \d documentos|Pedindo…)$/,
  });
const note = () =>
  screen.getByRole("textbox", { name: "Mensagem para o vendedor (opcional)" });
const box = (name: string) => screen.getByRole("checkbox", { name });
const options = () => screen.getAllByRole("option").map((o) => o.textContent);
const toastText = () => screen.getByRole("status").textContent;
const keys = () =>
  requestDocumentsAction.mock.calls.map(
    ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
  );

async function openWith(tipos: string[] = [], nota?: string): Promise<void> {
  // A real click focuses the trigger (the dialog returns focus to it).
  trigger().focus();
  await act(async () => fireEvent.click(trigger()));
  for (const tipo of tipos) fireEvent.click(box(tipo));
  if (nota !== undefined) fireEvent.change(note(), { target: { value: nota } });
}

describe("Pedir documento dialog (T108; AC 36, AC 37; D10, D11; F5, F6, F7)", () => {
  it("the trigger sits between Aprovar and Bloquear; the dialog: doc.h, doc.lead, exactly the enabled types, focus on the first", async () => {
    render(<Screen caseId="caso-a" />);
    const actions = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(actions).toEqual(["Aprovar", "Pedir documento", "Bloquear"]);
    expect(trigger().className).not.toMatch(/danger/);
    await openWith();
    expect(
      screen.getByRole("heading", { name: "Pedir documento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("O vendedor recebe um e-mail com o link para enviar."),
    ).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Quais documentos?" });
    expect(
      within(group)
        .getAllByRole("checkbox")
        .map((checkbox) => checkbox.closest("label")?.textContent),
    ).toEqual([
      "Contrato social ou CCMEI",
      "Comprovante de endereço da empresa",
      "Cartão CNPJ atualizado",
      "Contrato social ou procuração",
    ]);
    expect(screen.getAllByRole("checkbox")[0]).toHaveFocus();
    expect(note()).toHaveAttribute("maxLength", "280");
    expect(note()).toHaveAccessibleDescription(
      "O vendedor vê esta mensagem no link. Até 280 caracteres.",
    );
  });

  it("only the workspace's enabled types are offered", async () => {
    render(<Screen caseId="caso-a" tipos={["CARTAO_CNPJ"]} />);
    await openWith();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(box("Cartão CNPJ atualizado")).toBeInTheDocument();
  });

  it("no documentos_habilitados from /me: no Pedir documento at all", () => {
    render(<Screen caseId="caso-a" tipos={null} />);
    expect(
      screen.queryByRole("button", { name: "Pedir documento" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Bloquear" })).toBeVisible();
  });

  it("without a seller e-mail: doc.noemail.lead first (AC 37)", async () => {
    render(<Screen caseId="caso-a" email={false} />);
    await openWith();
    expect(
      screen.getByText(
        "Este vendedor não deixou e-mail. Depois de pedir, copie o link e envie pelo canal que você usa com ele.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("O vendedor recebe um e-mail com o link para enviar."),
    ).toBeNull();
  });

  it("none checked: doc.error.none on the group, focus on the first checkbox, nothing sent", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith();
    await act(async () => fireEvent.click(submit()));
    const group = screen.getByRole("group", { name: "Quais documentos?" });
    expect(group).toHaveAccessibleDescription(
      "Escolha pelo menos um documento.",
    );
    // AC 36: the checkbox that takes focus announces the error itself.
    const first = screen.getAllByRole("checkbox")[0];
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-invalid", "true");
    expect(first).toHaveAccessibleDescription(
      "Escolha pelo menos um documento.",
    );
    expect(requestDocumentsAction).not.toHaveBeenCalled();
    // Checking one clears it.
    fireEvent.click(box("Cartão CNPJ atualizado"));
    expect(first).not.toHaveAttribute("aria-invalid");
    expect(first).not.toHaveAttribute("aria-describedby");
  });

  it("the plural submit: doc.submit.one with one, doc.submit.other with two", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"]);
    expect(submit()).toHaveAccessibleName("Pedir documento");
    fireEvent.click(box("Comprovante de endereço da empresa"));
    expect(submit()).toHaveAccessibleName("Pedir 2 documentos");
    expect(submit().className).not.toMatch(/danger/);
  });

  it("F6: non-optimistic: busy (doc.submit.busy), the case stays in the list and nothing navigates until the result; Esc while busy does nothing", async () => {
    const call = deferred();
    requestDocumentsAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" />);
    await openWith(
      ["Cartão CNPJ atualizado", "Contrato social ou CCMEI"],
      "Envie até sexta.",
    );
    await act(async () => fireEvent.click(submit()));
    expect(submit()).toHaveTextContent("Pedindo…");
    expect(submit()).toHaveAttribute("aria-busy", "true");
    expect(options()).toEqual(IDS);
    expect(router.push).not.toHaveBeenCalled();
    expect(shell?.isPaused()).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(dialog()).not.toBeNull();
    // The options' order, whatever the click order.
    expect(requestDocumentsAction).toHaveBeenCalledWith({
      caseId: "caso-a",
      idempotencyKey: expect.any(String),
      tipos: ["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"],
      notaVendedor: "Envie até sexta.",
    });
    expect(decideAction).not.toHaveBeenCalled();
  });

  it("with an e-mail, on ok: the dialog closes, toast.requested + toast.audit, then /fila/{next} (D5)", async () => {
    requestDocumentsAction.mockResolvedValueOnce({ ok: true });
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"]);
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(dialog()).toBeNull();
    expect(toastText()).toBe(
      "Documento pedido: Empresa caso-a Registrado na trilha de auditoria.",
    );
    expect(router.push).toHaveBeenCalledWith("/fila/caso-b?ate=50", {
      scroll: false,
    });
    expect(shell?.isPaused()).toBe(false);
    const [input] = requestDocumentsAction.mock.calls[0] ?? [];
    expect(input).not.toHaveProperty("notaVendedor");
  });

  it("without an e-mail, on ok: the dialog closes and the screen stays on the case (D11)", async () => {
    requestDocumentsAction.mockResolvedValueOnce({
      ok: true,
      linkVendedor: "https://kybr.test/v/abc/c/AAAAAAAAAAAAAAAAAAAAAA",
    });
    render(<Screen caseId="caso-a" email={false} />);
    await openWith(["Cartão CNPJ atualizado"]);
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(dialog()).toBeNull();
    expect(toastText()).toContain("Documento pedido: Empresa caso-a");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // T109: the action's link at once, with focus on doc.link.h.
    await act(
      async () =>
        new Promise<void>((done) => requestAnimationFrame(() => done())),
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Pedido criado. Envie este link ao vendedor:",
      }),
    ).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /^Pedido criado/ })).toHaveValue(
      "https://kybr.test/v/abc/c/AAAAAAAAAAAAAAAAAAAAAA",
    );
  });

  it.each(["DOCUMENTO_NAO_HABILITADO", "VALOR_INVALIDO"])(
    "%s: error.network in the dialog (role=alert), the values kept, no toast; the key is spent",
    async (code) => {
      requestDocumentsAction.mockResolvedValueOnce({ ok: false, code });
      render(<Screen caseId="caso-a" />);
      await openWith(["Cartão CNPJ atualizado"], "Nota.");
      await act(async () => fireEvent.click(submit()));
      await flush();
      expect(dialog()).not.toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR);
      expect(box("Cartão CNPJ atualizado")).toBeChecked();
      expect(note()).toHaveValue("Nota.");
      expect(toastText()).toBe("");
      expect(router.refresh).not.toHaveBeenCalled();
      requestDocumentsAction.mockResolvedValueOnce({ ok: true });
      await act(async () => fireEvent.click(submit()));
      expect(keys()[1]).not.toBe(keys()[0]);
    },
  );

  it.each(["NETWORK", "UNAVAILABLE"] as const)(
    "F5/F6 (M6C-01): %s is unknown → error.network, the case is re-read, and the retry carries the same key, even after a remount and a reopen",
    async (code) => {
      requestDocumentsAction.mockResolvedValueOnce({ ok: false, code });
      const { rerender } = render(<Screen caseId="caso-a" />);
      await openWith(["Cartão CNPJ atualizado"], "x");
      await act(async () => fireEvent.click(submit()));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR);
      expect(router.refresh).toHaveBeenCalledTimes(1);
      // A server render: it also ends T111's offline hint.
      rerender(<Screen caseId="caso-b" renderedAt={2} />);
      rerender(<Screen caseId="caso-a" renderedAt={2} />);
      requestDocumentsAction.mockResolvedValueOnce({ ok: true });
      await openWith(["Cartão CNPJ atualizado"], "x");
      await act(async () => fireEvent.click(submit()));
      expect(keys()).toHaveLength(2);
      expect(keys()[1]).toBe(keys()[0]);
    },
  );

  it("F5: changed types or a changed note is a new intent, with a new key", async () => {
    requestDocumentsAction.mockResolvedValue({ ok: false, code: "NETWORK" });
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"]);
    await act(async () => fireEvent.click(submit()));
    await flush();
    fireEvent.click(box("Comprovante de endereço da empresa"));
    await act(async () => fireEvent.click(submit()));
    await flush();
    fireEvent.change(note(), { target: { value: "nova" } });
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(new Set(keys()).size).toBe(3);
    requestDocumentsAction.mockReset();
  });

  it("the conflict notice's polite region is mounted, empty, before any conflict (P6-003)", () => {
    const { container } = render(<Screen caseId="caso-a" />);
    const region = container.querySelector("[data-fila-conflict]");
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("");
  });

  it("409: the dialog closes and T106's conflict state shows, announced in the detail's polite region, with focus on the case's heading (P6-003); no toast, no navigation", async () => {
    requestDocumentsAction.mockResolvedValueOnce({
      ok: false,
      code: "CASO_JA_DECIDIDO",
      decididoEm: "2026-10-06T13:05:00.000Z",
    });
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"]);
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(dialog()).toBeNull();
    const notice = screen.getByText(
      "Este caso já tinha sido decidido em 06/10, 10:05.",
    );
    expect(notice.closest("[data-fila-conflict]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    // The trigger unmounts once the re-read shows the decided state.
    expect(screen.getByText("Caso caso-a")).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
    expect(toastText()).toBe("");
  });

  it("SESSAO_EXPIRADA: the session-expiry path, no alert", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      pathname: "/fila/caso-a",
      search: "",
      assign,
    });
    try {
      requestDocumentsAction.mockResolvedValueOnce({
        ok: false,
        code: "SESSAO_EXPIRADA",
      });
      render(<Screen caseId="caso-a" />);
      await openWith(["Cartão CNPJ atualizado"]);
      await act(async () => fireEvent.click(submit()));
      await flush();
      expect(assign).toHaveBeenCalledWith(
        expect.stringMatching(/^\/entrar\?motivo=sessao/),
      );
      // The dialog's alert region stays empty.
      expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Esc or Cancelar when idle closes, focus returns to Pedir documento, and the draft is gone on reopen", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"], "rascunho");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(trigger()).toHaveFocus();
    await openWith();
    expect(box("Cartão CNPJ atualizado")).not.toBeChecked();
    expect(note()).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(dialog()).toBeNull();
  });

  it("F6 caveat: an ok after DECIDE_TIMEOUT_MS doesn't close the dialog, toast or navigate", async () => {
    vi.useFakeTimers();
    try {
      const call = deferred();
      requestDocumentsAction.mockReturnValueOnce(call.promise);
      render(<Screen caseId="caso-a" />);
      await openWith(["Cartão CNPJ atualizado"]);
      await act(async () => fireEvent.click(submit()));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR);
      await act(async () => {
        call.resolve({ ok: true });
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(dialog()).not.toBeNull();
      expect(toastText()).toBe("");
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("E3: an ok after Renata left /fila/{id}: the toast, but no navigation", async () => {
    const call = deferred();
    requestDocumentsAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" />);
    await openWith(["Cartão CNPJ atualizado"]);
    await act(async () => fireEvent.click(submit()));
    window.history.pushState(null, "", "/lote");
    await act(async () => call.resolve({ ok: true }));
    expect(toastText()).toContain("Documento pedido: Empresa caso-a");
    expect(router.push).not.toHaveBeenCalled();
  });
});
