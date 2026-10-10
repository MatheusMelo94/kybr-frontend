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
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { ADVANCE_GUARD_MS } from "@/features/panel-fila/limits";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";

const decideAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-fila/actions", () => ({
  decideAction,
  requestDocumentsAction: vi.fn(),
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// QA-M6-004 (Q4, DF-07): below lg the next case's Aprovar renders under
// the finger once an advance lands, so a double tap decided two cases. For
// ADVANCE_GUARD_MS after the newly shown case's actions mount (or become
// enabled), pointer activations of its decisions are ignored. Keyboard
// activation (a click with detail 0) never is.

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

let online: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
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
afterEach(() => vi.useRealTimers());

function setOnline(next: boolean): void {
  online = next;
  act(() => {
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  });
}

function Screen({ caseId }: { caseId: string }): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ToastProvider closeLabel="Fechar">
        <FilaProvider renderedAt={1}>
          <span id={FILA_TAB_ACTIVE_ID}>Para decidir (3)</span>
          <CaseListbox
            aba="aberto"
            options={IDS.map((id) => ({ id, content: <span>{id}</span> }))}
            query="?ate=50"
            selectedId={caseId}
          />
          <DetailPane key={caseId} caseId={caseId}>
            <h2 data-detail-heading tabIndex={-1}>
              Caso {caseId}
            </h2>
            <CaseActions
              caseId={caseId}
              origem="link"
              razao={`Empresa ${caseId}`}
              webhook
              request={{ tipos: ["CARTAO_CNPJ"], vendedorTemEmail: true }}
            />
          </DetailPane>
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

const approve = () => screen.getByRole("button", { name: "Aprovar" });
const tap = (element: HTMLElement) => fireEvent.click(element, { detail: 1 });
const press = (element: HTMLElement) => fireEvent.click(element, { detail: 0 });

/** caso-a decided with a tap, `latency` ms later the advance lands on caso-b. */
async function advanceToB(latency = 0) {
  let resolve: (result: DecideResult) => void = () => undefined;
  decideAction.mockReturnValueOnce(
    new Promise<DecideResult>((done) => (resolve = done)),
  );
  const view = render(<Screen caseId="caso-a" />);
  await act(async () => tap(approve()));
  if (latency > 0) await act(async () => vi.advanceTimersByTime(latency));
  await act(async () => resolve({ ok: true }));
  expect(router.push).toHaveBeenLastCalledWith("/fila/caso-b?ate=50", {
    scroll: false,
  });
  view.rerender(<Screen caseId="caso-b" />);
  decideAction.mockResolvedValue({ ok: true });
  return view;
}

describe("the advance guard (QA-M6-004, Q4)", () => {
  it("ignores a tap on the next case's Aprovar right after the advance lands", async () => {
    vi.useFakeTimers();
    const { container } = await advanceToB();
    expect(container.querySelector("[data-case-actions]")).toHaveAttribute(
      "data-advance-guard",
    );
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Caso caso-b")).toBeInTheDocument();
  });

  it("ignores a tap on the next case's Bloquear and Pedir documento triggers too", async () => {
    vi.useFakeTimers();
    await advanceToB();
    await act(async () =>
      tap(screen.getByRole("button", { name: "Bloquear" })),
    );
    await act(async () =>
      tap(screen.getByRole("button", { name: "Pedir documento" })),
    );
    expect(proto.showModal).not.toHaveBeenCalled();
    // The keyboard still opens them.
    await act(async () =>
      press(screen.getByRole("button", { name: "Bloquear" })),
    );
    expect(proto.showModal).toHaveBeenCalledTimes(1);
    // Inside the open dialog a tap is the dialog's own, guard or not.
    await act(async () =>
      tap(screen.getByRole("button", { name: "Cancelar" })),
    );
    expect(proto.close).toHaveBeenCalled();
  });

  it("never blocks the keyboard: Enter or Space (a click with detail 0) decides at once", async () => {
    vi.useFakeTimers();
    await advanceToB();
    await act(async () => press(approve()));
    expect(decideAction).toHaveBeenCalledTimes(2);
    expect(decideAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ caseId: "caso-b" }),
    );
  });

  it("after ADVANCE_GUARD_MS a tap decides the next case", async () => {
    vi.useFakeTimers();
    const { container } = await advanceToB();
    await act(async () => vi.advanceTimersByTime(ADVANCE_GUARD_MS));
    expect(container.querySelector("[data-case-actions]")).not.toHaveAttribute(
      "data-advance-guard",
    );
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(2);
    expect(decideAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ caseId: "caso-b" }),
    );
  });

  it("a slow decision: the window runs from when the next case's actions mount, not from the first tap", async () => {
    vi.useFakeTimers();
    await advanceToB(ADVANCE_GUARD_MS * 2);
    await act(async () => vi.advanceTimersByTime(ADVANCE_GUARD_MS - 50));
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(1);
  });

  it("re-arms when the actions become enabled again (offline, then back online)", async () => {
    vi.useFakeTimers();
    await advanceToB();
    await act(async () => vi.advanceTimersByTime(ADVANCE_GUARD_MS));
    setOnline(false);
    setOnline(true);
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(ADVANCE_GUARD_MS));
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(2);
  });

  it("a case opened without an advance (a deep link, a list pick) is not guarded", async () => {
    decideAction.mockResolvedValue({ ok: true });
    const { container } = render(<Screen caseId="caso-b" />);
    expect(container.querySelector("[data-case-actions]")).not.toHaveAttribute(
      "data-advance-guard",
    );
    await act(async () => tap(approve()));
    expect(decideAction).toHaveBeenCalledTimes(1);
  });
});
