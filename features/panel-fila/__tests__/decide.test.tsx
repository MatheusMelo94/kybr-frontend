import { act, fireEvent, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import type { DecideResult } from "@/features/panel-fila/actions";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { EmptyOpen } from "@/features/panel-fila/components/empty-open";
import { EmptyWaiting } from "@/features/panel-fila/components/empty-waiting";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
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

beforeEach(() => {
  vi.clearAllMocks();
  shell = undefined;
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
        <CaseActions
          caseId={caseId}
          origem={origem}
          razao={`Empresa ${caseId}`}
        />
      </DetailPane>
    </>
  );
}

function Screen({
  idle,
  ...props
}: Parameters<typeof Page>[0] & { idle?: JSX.Element }): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ShellProbe />
      <ToastProvider closeLabel="Fechar">
        <FilaProvider>
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
    decideAction.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
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
    rerender(<Screen caseId="caso-b" ids={IDS} />);
    rerender(<Screen caseId="caso-a" ids={IDS} />);
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
      render(<Screen caseId="caso-a" ids={IDS} />);
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

      decideAction.mockResolvedValueOnce({ ok: true });
      await act(async () => fireEvent.click(approve()));
      const [first, second] = decideAction.mock.calls.map(
        ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
      );
      expect(second).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
