import { act, fireEvent, render, screen } from "@testing-library/react";
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
import type { DecideResult } from "@/features/panel-fila/actions";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { ConflictNotice } from "@/features/panel-fila/components/conflict-notice";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";
import { SessionExpiryProvider } from "@/features/panel-shell/components/session-expiry-provider";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";

const decideAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-fila/actions", () => ({ decideAction }));
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

function Screen({
  caseId,
  renderedAt = 1,
  webhook = true,
}: {
  caseId: string;
  /** The layout's server render: a re-read moves it (T106, T111). */
  renderedAt?: number;
  webhook?: boolean;
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
              <CaseActions
                caseId={caseId}
                origem="link"
                razao={`Empresa ${caseId}`}
                webhook={webhook}
              />
            </DetailPane>
          </div>
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

// An open decide call keeps React's transitions entangled (decide.test.tsx).
const open: ((result: DecideResult) => void)[] = [];
afterEach(async () => {
  for (const resolve of open.splice(0)) resolve({ ok: false, code: "NETWORK" });
  await act(async () => new Promise((done) => setTimeout(done, 0)));
});

function deferred(): {
  promise: Promise<DecideResult>;
  resolve: (result: DecideResult) => void;
} {
  let resolve: (result: DecideResult) => void = () => undefined;
  const promise = new Promise<DecideResult>((done) => (resolve = done));
  open.push(resolve);
  return { promise, resolve };
}

const flush = () => act(async () => new Promise((done) => setTimeout(done, 0)));
const trigger = () => screen.getByRole("button", { name: "Bloquear" });
const dialog = () => screen.queryByRole("dialog", { hidden: false });
const submit = () =>
  screen.getByRole("button", { name: /^(Bloquear vendedor|Bloqueando…)$/ });
const note = () =>
  screen.getByRole("textbox", { name: "Mensagem para o vendedor (opcional)" });
const reason = (name: string) => screen.getByRole("radio", { name });
const options = () => screen.getAllByRole("option").map((o) => o.textContent);
const toastText = () => screen.getByRole("status").textContent;
const keys = () =>
  decideAction.mock.calls.map(
    ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
  );

async function openWith(motivo?: string, nota?: string): Promise<void> {
  // A real click focuses the trigger (the dialog returns focus to it).
  trigger().focus();
  await act(async () => fireEvent.click(trigger()));
  if (motivo !== undefined) fireEvent.click(reason(motivo));
  if (nota !== undefined) fireEvent.change(note(), { target: { value: nota } });
}

describe("Bloquear dialog (T107; AC 38; D10; F5, F6, F7)", () => {
  it("the trigger is a neutral outline; the dialog: block.h with the razão social, the webhook lead, eight reasons, focus on the first", async () => {
    render(<Screen caseId="caso-a" />);
    expect(trigger().className).not.toMatch(/danger/);
    await act(async () => fireEvent.click(trigger()));
    expect(
      screen.getByRole("heading", { name: "Bloquear Empresa caso-a?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "O vendedor vê o motivo no link, e avisamos seu sistema pelo webhook.",
      ),
    ).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(8);
    expect(radios[0]).toHaveFocus();
    expect(note()).toHaveAttribute("maxLength", "280");
    expect(note()).toHaveAccessibleDescription(
      "O vendedor vê esta mensagem no link. Até 280 caracteres.",
    );
  });

  it("the confirmation is the ink primary with the explicit verb, never red (DDR-0003 point 3)", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith();
    expect(submit()).toHaveTextContent("Bloquear vendedor");
    expect(submit().className).toMatch(/\bbg-accent\b/);
    expect(submit().className).not.toMatch(/danger/);
  });

  it("without a webhook: block.lead.nowebhook", async () => {
    render(<Screen caseId="caso-a" webhook={false} />);
    await act(async () => fireEvent.click(trigger()));
    expect(
      screen.getByText(
        "O vendedor vê o motivo no link. Bloqueie também o vendedor na sua plataforma.",
      ),
    ).toBeInTheDocument();
  });

  it("no reason: block.error.reason on the radio group, which takes focus; nothing is sent", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith();
    await act(async () => fireEvent.click(submit()));
    const group = screen.getByRole("radiogroup", { name: "Motivo" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Escolha um motivo.");
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    expect(decideAction).not.toHaveBeenCalled();
  });

  it("F6: non-optimistic: busy, the case stays in the list and nothing navigates until the result; Esc while busy does nothing", async () => {
    const call = deferred();
    decideAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" />);
    await openWith("Responsável não é sócio", "Fale com o suporte.");
    await act(async () => fireEvent.click(submit()));
    expect(submit()).toHaveTextContent("Bloqueando…");
    expect(submit()).toHaveAttribute("aria-busy", "true");
    expect(options()).toEqual(IDS);
    expect(router.push).not.toHaveBeenCalled();
    expect(shell?.isPaused()).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(dialog()).not.toBeNull();
    expect(decideAction).toHaveBeenCalledWith({
      caseId: "caso-a",
      idempotencyKey: expect.any(String),
      decisao: "bloquear",
      motivoCodigo: "RESPONSAVEL_NAO_SOCIO",
      notaVendedor: "Fale com o suporte.",
    });
  });

  it("on ok: the dialog closes, toast.blocked + toast.audit, then /fila/{next} with focus on its heading", async () => {
    decideAction.mockResolvedValueOnce({ ok: true });
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo");
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(dialog()).toBeNull();
    expect(toastText()).toBe(
      "Bloqueado: Empresa caso-a Registrado na trilha de auditoria.",
    );
    expect(router.push).toHaveBeenCalledWith("/fila/caso-b?ate=50", {
      scroll: false,
    });
    expect(shell?.isPaused()).toBe(false);
    const [input] = decideAction.mock.calls[0] ?? [];
    expect(input).not.toHaveProperty("notaVendedor");
  });

  it("a definitive failure (an explicit 4xx code): error.network in the dialog (role=alert), the values kept, no toast; the key is spent", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "VALOR_INVALIDO" });
    render(<Screen caseId="caso-a" />);
    await openWith("MEI acima do limite", "Nota.");
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(dialog()).not.toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR);
    expect(reason("MEI acima do limite")).toBeChecked();
    expect(note()).toHaveValue("Nota.");
    expect(toastText()).toBe("");
    expect(router.refresh).not.toHaveBeenCalled();
    decideAction.mockResolvedValueOnce({ ok: true });
    await act(async () => fireEvent.click(submit()));
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it.each(["NETWORK", "UNAVAILABLE"] as const)(
    "F5/F6 (M6C-01): %s is unknown → error.network, the case is re-read, and the retry carries the same key, even after a remount and a reopen",
    async (code) => {
      decideAction.mockResolvedValueOnce({ ok: false, code });
      const { rerender } = render(<Screen caseId="caso-a" />);
      await openWith("Outro motivo", "x");
      await act(async () => fireEvent.click(submit()));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR);
      expect(router.refresh).toHaveBeenCalledTimes(1);
      // The re-read remounts the page; the dialog reopens with the same body.
      // A server render: it also ends T111's offline hint.
      rerender(<Screen caseId="caso-b" renderedAt={2} />);
      rerender(<Screen caseId="caso-a" renderedAt={2} />);
      decideAction.mockResolvedValueOnce({ ok: true });
      await openWith("Outro motivo", "x");
      await act(async () => fireEvent.click(submit()));
      expect(keys()).toHaveLength(2);
      expect(keys()[1]).toBe(keys()[0]);
    },
  );

  it("F5: a changed reason or note is a new intent, with a new key", async () => {
    decideAction.mockResolvedValue({ ok: false, code: "NETWORK" });
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo");
    await act(async () => fireEvent.click(submit()));
    await flush();
    fireEvent.click(reason("MEI acima do limite"));
    await act(async () => fireEvent.click(submit()));
    await flush();
    fireEvent.change(note(), { target: { value: "nova" } });
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(new Set(keys()).size).toBe(3);
    decideAction.mockReset();
  });

  it("MOTIVO_OBRIGATORIO from the server: block.error.reason on the group", async () => {
    decideAction.mockResolvedValueOnce({
      ok: false,
      code: "MOTIVO_OBRIGATORIO",
    });
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo");
    await act(async () => fireEvent.click(submit()));
    await flush();
    expect(
      screen.getByRole("radiogroup", { name: "Motivo" }),
    ).toHaveAccessibleDescription("Escolha um motivo.");
  });

  it("the conflict notice's polite region is mounted, empty, before any conflict (P6-003)", () => {
    const { container } = render(<Screen caseId="caso-a" />);
    const region = container.querySelector("[data-fila-conflict]");
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("");
  });

  it("409: the dialog closes and T106's conflict state shows, announced in the detail's polite region, with focus on the case's heading (P6-003); no toast, no navigation", async () => {
    decideAction.mockResolvedValueOnce({
      ok: false,
      code: "CASO_JA_DECIDIDO",
      decididoEm: "2026-10-06T13:05:00.000Z",
    });
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo");
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
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(toastText()).toBe("");
  });

  it("AC 7 (P6-010): a reason only is a dirty draft: SESSAO_EXPIRADA brings perdido=1", async () => {
    const assign = vi.fn();
    const location = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      pathname: "/fila/caso-a",
      search: "",
      assign,
    });
    try {
      decideAction.mockResolvedValueOnce({
        ok: false,
        code: "SESSAO_EXPIRADA",
      });
      // The shell's draft registry (useDialogDraft) says what was lost.
      render(
        <SessionExpiryProvider>
          <Screen caseId="caso-a" />
        </SessionExpiryProvider>,
      );
      await openWith("MEI acima do limite");
      await act(async () => fireEvent.click(submit()));
      await flush();
      expect(assign).toHaveBeenCalledTimes(1);
      const url = new URL(String(assign.mock.calls[0]?.[0]), "https://x");
      expect(url.pathname).toBe("/entrar");
      expect(url.searchParams.get("motivo")).toBe("sessao");
      expect(url.searchParams.get("perdido")).toBe("1");
    } finally {
      location.mockRestore();
    }
  });

  it("Q9: Esc or Cancelar when idle closes, focus returns to Bloquear, and the draft is gone on reopen", async () => {
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo", "rascunho");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(trigger()).toHaveFocus();
    await openWith();
    expect(reason("Outro motivo")).not.toBeChecked();
    expect(note()).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(dialog()).toBeNull();
  });

  it("F6 caveat: an ok after DECIDE_TIMEOUT_MS doesn't close the dialog, toast or navigate", async () => {
    vi.useFakeTimers();
    try {
      const call = deferred();
      decideAction.mockReturnValueOnce(call.promise);
      render(<Screen caseId="caso-a" />);
      await openWith("Outro motivo");
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
    decideAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" />);
    await openWith("Outro motivo");
    await act(async () => fireEvent.click(submit()));
    window.history.pushState(null, "", "/lote");
    await act(async () => call.resolve({ ok: true }));
    expect(toastText()).toContain("Bloqueado: Empresa caso-a");
    expect(router.push).not.toHaveBeenCalled();
  });
});
