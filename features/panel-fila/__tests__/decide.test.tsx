import { act, fireEvent, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import type { DecideResult } from "@/features/panel-fila/actions";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { ConflictNotice } from "@/features/panel-fila/components/conflict-notice";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { EmptyOpen } from "@/features/panel-fila/components/empty-open";
import { EmptyWaiting } from "@/features/panel-fila/components/empty-waiting";
import {
  FilaProvider,
  useFila,
} from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";
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

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDS = ["caso-a", "caso-b", "caso-c"];

let shell: ReturnType<typeof useShellStatus> | undefined;
function ShellProbe(): null {
  shell = useShellStatus();
  return null;
}

let fila: ReturnType<typeof useFila> | undefined;
function FilaProbe(): null {
  fila = useFila();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  shell = undefined;
  fila = undefined;
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

function Page({
  caseId,
  ids,
  origem = "link",
}: {
  caseId: string;
  ids: readonly string[];
  origem?: "link" | "lote" | "monitoramento";
}): JSX.Element {
  return (
    <>
      <CaseListbox
        aba="aberto"
        options={ids.map((id) => ({ id, content: <span>{id}</span> }))}
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
          origem={origem}
          razao={`Empresa ${caseId}`}
          webhook
        />
      </DetailPane>
    </>
  );
}

function Screen({
  idle,
  renderedAt = 1,
  ...props
}: Parameters<typeof Page>[0] & {
  idle?: JSX.Element;
  renderedAt?: number;
}): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ShellProbe />
      <ToastProvider closeLabel="Fechar">
        <FilaProvider renderedAt={renderedAt}>
          <FilaProbe />
          <span id={FILA_TAB_ACTIVE_ID}>Para decidir (3)</span>
          {idle ? (
            <DetailPane caseId={null}>{idle}</DetailPane>
          ) : (
            <Page key={props.caseId} {...props} />
          )}
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

// React entangles pending async transitions: one left hanging keeps every
// later optimistic update from reverting. Each test's open calls end after it.
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

const options = () => screen.getAllByRole("option").map((o) => o.textContent);
const toastText = () => screen.getByRole("status").textContent;
const approve = () => screen.getByRole("button", { name: "Aprovar" });
/** Lets the decision's async transition settle. */
const flush = () => act(async () => new Promise((done) => setTimeout(done, 0)));

describe("Aprovar / Manter aprovado (AC 31, AC 33; D13; F5, F6, F7)", () => {
  it("labels: Aprovar, or Manter aprovado for an alert (origem monitoramento)", () => {
    const { unmount } = render(<Screen caseId="caso-a" ids={IDS} />);
    expect(approve()).toBeInTheDocument();
    unmount();
    render(<Screen caseId="caso-a" ids={IDS} origem="monitoramento" />);
    expect(
      screen.getByRole("button", { name: "Manter aprovado" }),
    ).toBeInTheDocument();
  });

  it("one click, no confirmation: the item leaves at once, the next is selected, the detail shows the skeleton; no navigation and no toast before the result", async () => {
    const call = deferred();
    decideAction.mockReturnValue(call.promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));

    expect(options()).toEqual(["caso-b", "caso-c"]);
    expect(screen.getByRole("option", { name: "caso-b" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Caso caso-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("fila-detail-skeleton")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(toastText()).toBe("");
    expect(decideAction).toHaveBeenCalledWith({
      caseId: "caso-a",
      idempotencyKey: expect.stringMatching(UUID),
      decisao: "aprovar",
    });
  });

  it("on ok: the toast (with toast.audit), then /fila/{next} with the tab and length kept", async () => {
    const call = deferred();
    decideAction.mockReturnValue(call.promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await act(async () => call.resolve({ ok: true }));

    expect(toastText()).toBe(
      "Aprovado: Empresa caso-a Registrado na trilha de auditoria.",
    );
    expect(router.push).toHaveBeenCalledWith("/fila/caso-b?ate=50", {
      scroll: false,
    });
  });

  it("Manter aprovado: toast.kept", async () => {
    decideAction.mockResolvedValue({ ok: true });
    render(<Screen caseId="caso-a" ids={IDS} origem="monitoramento" />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Manter aprovado" })),
    );
    expect(decideAction).toHaveBeenCalledWith(
      expect.objectContaining({ decisao: "manter" }),
    );
    expect(toastText()).toContain("Mantido como aprovado: Empresa caso-a");
  });

  it("the last case goes to the one above; the only case goes to /fila (the empty state)", async () => {
    decideAction.mockResolvedValue({ ok: true });
    const { unmount } = render(<Screen caseId="caso-c" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    expect(router.push).toHaveBeenLastCalledWith("/fila/caso-b?ate=50", {
      scroll: false,
    });
    unmount();
    render(<Screen caseId="caso-a" ids={["caso-a"]} />);
    await act(async () => fireEvent.click(approve()));
    expect(router.push).toHaveBeenLastCalledWith("/fila?ate=50", {
      scroll: false,
    });
  });

  it("R1: a case decided here is never the next one, even when a stale list still shows it", async () => {
    decideAction.mockResolvedValue({ ok: true });
    const { rerender } = render(
      <Screen caseId="caso-b" ids={["caso-b", "caso-c"]} />,
    );
    await act(async () => fireEvent.click(approve()));
    expect(router.push).toHaveBeenLastCalledWith("/fila/caso-c?ate=50", {
      scroll: false,
    });
    // The next page's list still has the decided case above it (lagging).
    rerender(<Screen caseId="caso-c" ids={["caso-b", "caso-c"]} />);
    await act(async () => fireEvent.click(approve()));
    expect(router.push).toHaveBeenLastCalledWith("/fila?ate=50", {
      scroll: false,
    });
  });

  it("focus lands on the next case's heading when it renders", async () => {
    decideAction.mockResolvedValue({ ok: true });
    const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    rerender(<Screen caseId="caso-b" ids={["caso-b", "caso-c"]} />);
    expect(screen.getByText("Caso caso-b")).toHaveFocus();
  });

  it.each([
    ["Para decidir", <EmptyOpen key="o" detailHeading />],
    ["Aguardando", <EmptyWaiting key="w" detailHeading />],
  ] as const)(
    "F7: deciding the only case of %s lands on /fila, whose empty state takes the focus",
    async (_, empty) => {
      decideAction.mockResolvedValue({ ok: true });
      const { rerender } = render(<Screen caseId="caso-a" ids={["caso-a"]} />);
      await act(async () => fireEvent.click(approve()));
      rerender(<Screen caseId="caso-a" ids={[]} idle={empty} />);
      expect(document.activeElement).toHaveAttribute("data-detail-heading");
    },
  );

  it("F6: no toast and no navigation while the action never resolves; the button is busy meanwhile", async () => {
    // Never resolves while the test looks (afterEach ends it).
    decideAction.mockReturnValue(deferred().promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    expect(toastText()).toBe("");
    expect(router.push).not.toHaveBeenCalled();
    expect(decideAction).toHaveBeenCalledTimes(1);
  });

  it("the shell poller is paused while the decision is in flight, and resumed (with a poll) after", async () => {
    const call = deferred();
    decideAction.mockReturnValue(call.promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    expect(shell?.isPaused()).toBe(true);
    const before = shell?.pollRequests ?? 0;
    await act(async () => call.resolve({ ok: true }));
    expect(shell?.isPaused()).toBe(false);
    expect(shell?.pollRequests).toBe(before + 1);
  });

  it("a definitive failure: the item comes back in place and selected; no toast, no navigation; the next press gets a fresh key", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "VALOR_INVALIDO" });
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(options()).toEqual(IDS);
    expect(screen.getByRole("option", { name: "caso-a" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Caso caso-a")).toBeInTheDocument();
    expect(toastText()).toBe("");
    expect(router.push).not.toHaveBeenCalled();
    expect(shell?.isPaused()).toBe(false);

    decideAction.mockResolvedValueOnce({ ok: true });
    await act(async () => fireEvent.click(approve()));
    const [first, second] = decideAction.mock.calls.map(
      ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
    );
    expect(second).not.toBe(first);
  });

  it("F5: after NETWORK the retry carries the same key, even after the page subtree remounts (the re-read)", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "NETWORK" });
    const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    // The re-read remounts the page (a new Page key); the provider stays.
    // It's a server render (renderedAt moves), which also ends T111's
    // offline hint, so Aprovar is enabled again.
    rerender(<Screen caseId="caso-b" ids={IDS} renderedAt={2} />);
    rerender(<Screen caseId="caso-a" ids={IDS} renderedAt={2} />);
    decideAction.mockResolvedValueOnce({ ok: true });
    await act(async () => fireEvent.click(approve()));
    const [first, second] = decideAction.mock.calls.map(
      ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
    );
    expect(first).toMatch(UUID);
    expect(second).toBe(first);
  });

  it("F6: a rejected action call is NETWORK in place, never a throw", async () => {
    decideAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    expect(options()).toEqual(IDS);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("F6 caveat: an ok after DECIDE_TIMEOUT_MS changes nothing (no toast, no navigation) and releases the key", async () => {
    vi.useFakeTimers();
    try {
      const call = deferred();
      decideAction.mockReturnValueOnce(call.promise);
      const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
      await act(async () => fireEvent.click(approve()));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS);
      });
      expect(options()).toEqual(IDS);
      await act(async () => {
        call.resolve({ ok: true });
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(toastText()).toBe("");
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();

      // The re-read lands (a server render ends T111's offline hint).
      rerender(<Screen caseId="caso-a" ids={IDS} renderedAt={2} />);
      decideAction.mockResolvedValueOnce({ ok: true });
      await act(async () => fireEvent.click(approve()));
      expect(decideAction).toHaveBeenCalledTimes(2);
      const [first, second] = decideAction.mock.calls.map(
        ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
      );
      expect(second).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Decision failure, unknown outcome and conflict (T106; AC 34, 35; F5, F6)", () => {
  const ERROR =
    "Não conseguimos registrar a decisão. O caso voltou para a fila. Tente de novo.";
  const alertText = () => screen.queryByRole("alert")?.textContent ?? null;

  it("a definitive failure: fila.decide.error in an alert above the actions, focus back on the case's heading; no re-read", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "VALOR_INVALIDO" });
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(ERROR);
    expect(
      alert.compareDocumentPosition(approve()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Caso caso-a")).toHaveFocus();
    expect(toastText()).toBe("");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(fila?.offlineHint).toBe(false);
  });

  it("a second press clears the alert, and its ok shows the toast and moves on", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "VALOR_INVALIDO" });
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(alertText()).toBe(ERROR);
    const call = deferred();
    decideAction.mockReturnValueOnce(call.promise);
    await act(async () => fireEvent.click(approve()));
    expect(alertText()).toBeNull();
    await act(async () => call.resolve({ ok: true }));
    expect(toastText()).toContain("Empresa caso-a");
    expect(router.push).toHaveBeenCalledWith("/fila/caso-b?ate=50", {
      scroll: false,
    });
  });

  it("F6: a rejected call shows the alert on the case it was for, never a throw", async () => {
    decideAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(alertText()).toBe(ERROR);
    expect(screen.getByText("Caso caso-a")).toBeInTheDocument();
  });

  it("M6C-01: UNAVAILABLE (a server timeout, a 5xx, a 2xx failing the schema) is unknown: the alert, the case re-read, the same key on retry; no offline hint (the server answered)", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
    const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(alertText()).toBe(ERROR);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(fila?.offlineHint).toBe(false);
    rerender(<Screen caseId="caso-a" ids={IDS} renderedAt={2} />);
    decideAction.mockResolvedValueOnce({ ok: true });
    await act(async () => fireEvent.click(approve()));
    const [first, second] = decideAction.mock.calls.map(
      ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
    );
    expect(second).toBe(first);
  });

  it("F5/F6: an unknown outcome (NETWORK) shows the alert, re-reads the case and sets the offline hint", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "NETWORK" });
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(alertText()).toBe(ERROR);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(fila?.offlineHint).toBe(true);
  });

  it("F6: no result within DECIDE_TIMEOUT_MS → the alert and the re-read, until the server re-renders; nothing reports done", async () => {
    vi.useFakeTimers();
    try {
      const call = deferred();
      decideAction.mockReturnValueOnce(call.promise);
      const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
      await act(async () => fireEvent.click(approve()));
      expect(alertText()).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS);
      });
      expect(alertText()).toBe(ERROR);
      expect(router.refresh).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(router.refresh).toHaveBeenCalledTimes(2);
      // The re-read landed (the layout's renderedAt moved): no more refreshes.
      rerender(<Screen caseId="caso-a" ids={IDS} renderedAt={2} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });
      expect(router.refresh).toHaveBeenCalledTimes(2);
      expect(toastText()).toBe("");
      expect(alertText()).toBe(ERROR);
    } finally {
      vi.useRealTimers();
    }
  });

  it("409: fila.decide.conflict with decidido_em, the re-read, no alert, no toast, no navigation; focus on the heading", async () => {
    decideAction.mockResolvedValueOnce({
      ok: false,
      code: "CASO_JA_DECIDIDO",
      decididoEm: "2026-10-06T13:05:00.000Z",
      decisao: { tipo: "aprovar" },
    });
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(
      screen.getByText("Este caso já tinha sido decidido em 06/10, 10:05."),
    ).toBeInTheDocument();
    // AC 76 (T115): the time in tabular figures.
    expect(
      screen.getByText("Este caso já tinha sido decidido em 06/10, 10:05."),
    ).toHaveClass("tabular-nums");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(toastText()).toBe("");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText("Caso caso-a")).toHaveFocus();
  });

  it("the flash clears when the case is opened again later", async () => {
    decideAction.mockResolvedValueOnce({ ok: false, code: "VALOR_INVALIDO" });
    const { rerender } = render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    await flush();
    expect(alertText()).toBe(ERROR);
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "caso-b" })),
    );
    rerender(<Screen caseId="caso-b" ids={IDS} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "caso-a" })),
    );
    rerender(<Screen caseId="caso-a" ids={IDS} />);
    expect(alertText()).toBeNull();
  });

  it("SESSAO_EXPIRADA: the session-expiry path (ADR-0009 rule 7), no alert", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
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
      render(<Screen caseId="caso-a" ids={IDS} />);
      await act(async () => fireEvent.click(approve()));
      await flush();
      expect(assign).toHaveBeenCalledWith(
        expect.stringMatching(/^\/entrar\?motivo=sessao/),
      );
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("E3 (plan-m6 § 18): a result after Renata moved on never moves her", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/fila/caso-a?ate=50");
  });

  it("ok after she left /fila/{id}: the toast still shows, no navigation and no focus move", async () => {
    const call = deferred();
    decideAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    window.history.pushState(null, "", "/lote");
    await act(async () => call.resolve({ ok: true }));
    expect(toastText()).toContain("Empresa caso-a");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(fila?.focusIntent).toBeNull();
  });

  it("NETWORK after she left: no re-read (no refresh)", async () => {
    const call = deferred();
    decideAction.mockReturnValueOnce(call.promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));
    window.history.pushState(null, "", "/lote");
    await act(async () => call.resolve({ ok: false, code: "NETWORK" }));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("the collapse on Aprovar (T114; AC 70)", () => {
  it("captures before the item leaves and plays after: the options below move up, the leaving one fades as a snapshot", async () => {
    const reduceQuery = "(prefers-reduced-motion: reduce)";
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...media(query),
      matches: query !== reduceQuery,
    })) as typeof window.matchMedia;
    const animated: { text: string; keys: string[] }[] = [];
    Element.prototype.animate = vi.fn(function (
      this: Element,
      keyframes: Keyframe[],
    ) {
      animated.push({
        text: this.textContent ?? "",
        keys: keyframes.flatMap((frame) => Object.keys(frame)),
      });
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
    }) as unknown as Element["animate"];
    // Each option sits 50 px below the previous one in the list's order.
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const all = Array.from(document.querySelectorAll('[role="option"]'));
        const top = Math.max(0, all.indexOf(this)) * 50;
        return { top, left: 0, width: 300, height: 50 } as DOMRect;
      });

    decideAction.mockReturnValue(deferred().promise);
    render(<Screen caseId="caso-a" ids={IDS} />);
    await act(async () => fireEvent.click(approve()));

    expect(options()).toEqual(["caso-b", "caso-c"]);
    expect(animated.map((a) => a.text)).toEqual(["caso-b", "caso-c", "caso-a"]);
    expect(
      animated
        .slice(0, 2)
        .every((a) => a.keys.join() === "transform,transform"),
    ).toBe(true);
    expect(animated[2]?.keys).toEqual(["opacity", "opacity"]);
    rect.mockRestore();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it("the latest list to mount owns the collapse: an older list's late cleanup doesn't unregister it", () => {
    render(<Screen caseId="caso-a" ids={IDS} />);
    const older = { capture: vi.fn(), play: vi.fn() };
    const newer = { capture: vi.fn(), play: vi.fn() };
    const offOlder = fila?.setCollapse(older);
    const offNewer = fila?.setCollapse(newer);
    offOlder?.();
    fila?.captureCollapse("caso-b");
    expect(newer.capture).toHaveBeenCalledWith("caso-b");
    expect(older.capture).not.toHaveBeenCalled();
    offNewer?.();
    fila?.captureCollapse("caso-c");
    expect(newer.capture).toHaveBeenCalledTimes(1);
  });
});
