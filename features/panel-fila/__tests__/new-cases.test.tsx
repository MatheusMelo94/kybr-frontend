import { act, fireEvent, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NewCasesResult } from "@/features/panel-fila/poll-action";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { NewCasesNotice } from "@/features/panel-fila/components/new-cases-notice";
import { NewCasesPoller } from "@/features/panel-fila/components/new-cases-poller";
import type { FilaAba } from "@/features/panel-fila/search-params";
import {
  ShellStatusProvider,
  useShellStatus,
} from "@/features/panel-shell/shell-status-context";
import { FILA_NEW_CASES_INTERVAL_MS } from "@/features/panel-shell/polling";

const pollNewCasesAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-fila/poll-action", () => ({ pollNewCasesAction }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const G1 = "2026-10-06T12:00:00.000Z";
const G2 = "2026-10-06T12:05:00.000Z";

let visibility: DocumentVisibilityState;
let online: boolean;
let shell: ReturnType<typeof useShellStatus> | undefined;
function ShellProbe(): null {
  shell = useShellStatus();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  shell = undefined;
  visibility = "visible";
  online = true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  window.history.replaceState(null, "", "/fila/caso-a?ate=25");
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
  Element.prototype.scrollIntoView = vi.fn();
  pollNewCasesAction.mockResolvedValue({ ok: true, novos: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

function Screen({
  ids,
  renderedAt = 1,
  generatedAt = G1,
  aba = "aberto",
  query = "?ate=25",
  selectedId = "caso-a",
}: {
  ids: string[];
  renderedAt?: number;
  generatedAt?: string;
  aba?: FilaAba;
  query?: string;
  selectedId?: string | null;
}): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ShellProbe />
      <FilaProvider renderedAt={renderedAt}>
        <NewCasesPoller />
        <span id={FILA_TAB_ACTIVE_ID}>Para decidir</span>
        <NewCasesNotice aba={aba} />
        <CaseListbox
          aba={aba}
          options={ids.map((id) => ({ id, content: <span>{id}</span> }))}
          query={query}
          selectedId={selectedId}
          generatedAt={generatedAt}
        />
      </FilaProvider>
    </ShellStatusProvider>
  );
}

const options = () => screen.getAllByRole("option").map((o) => o.textContent);
const mostrar = () => screen.queryByRole("button", { name: "Mostrar" });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("new cases: the poll, the notice and Mostrar (T110; D3; AC 40; E4; F10)", () => {
  it("polls every FILA_NEW_CASES_INTERVAL_MS with desde = the list's gerado_em, only while visible and online", async () => {
    render(<Screen ids={["caso-a", "caso-b"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenCalledTimes(1);
    expect(pollNewCasesAction).toHaveBeenCalledWith({ desde: G1 });
    visibility = "hidden";
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    visibility = "visible";
    online = false;
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenCalledTimes(1);
  });

  it("polls once on becoming visible", async () => {
    render(<Screen ids={["caso-a"]} />);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pollNewCasesAction).toHaveBeenCalledTimes(1);
  });

  it("never overlaps: a slow poll skips the next tick", async () => {
    let resolve: (result: NewCasesResult) => void = () => undefined;
    pollNewCasesAction.mockReturnValueOnce(
      new Promise<NewCasesResult>((done) => (resolve = done)),
    );
    render(<Screen ids={["caso-a"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, novos: 0 }));
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenCalledTimes(2);
  });

  it("not while a Fila decision has paused the shell's polls", async () => {
    render(<Screen ids={["caso-a"]} />);
    act(() => shell?.pause());
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).not.toHaveBeenCalled();
  });

  it("novos=1: fila.new.one + Mostrar in a polite live region; the list's order and the selection don't change", async () => {
    pollNewCasesAction.mockResolvedValueOnce({ ok: true, novos: 1 });
    const { rerender } = render(<Screen ids={["caso-a", "caso-b"]} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(region).toHaveTextContent("1 caso novo");
    expect(mostrar()).toBeInTheDocument();
    // A server render (a decision's revalidation) brings the new case: hidden.
    rerender(<Screen ids={["caso-novo", "caso-a", "caso-b"]} renderedAt={2} />);
    expect(options()).toEqual(["caso-a", "caso-b"]);
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "caso-a",
    );
  });

  it("fila.new.other for several", async () => {
    pollNewCasesAction.mockResolvedValueOnce({ ok: true, novos: 3 });
    render(<Screen ids={["caso-a"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent("3 casos novos");
  });

  it("Mostrar: a refresh until the server re-renders; then the new case shows in the server's order, the notice clears and desde resets", async () => {
    pollNewCasesAction.mockResolvedValueOnce({ ok: true, novos: 1 });
    const { rerender } = render(<Screen ids={["caso-a", "caso-b"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    rerender(<Screen ids={["caso-novo", "caso-a", "caso-b"]} renderedAt={2} />);
    await act(async () => fireEvent.click(mostrar() as HTMLElement));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(mostrar()).toBeNull();
    expect(options()).toEqual(["caso-a", "caso-b"]);
    rerender(
      <Screen
        ids={["caso-novo", "caso-a", "caso-b"]}
        renderedAt={3}
        generatedAt={G2}
      />,
    );
    expect(options()).toEqual(["caso-novo", "caso-a", "caso-b"]);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenLastCalledWith({ desde: G2 });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("E4: a poll in flight when Mostrar is pressed is discarded (its generation is stale)", async () => {
    pollNewCasesAction.mockResolvedValueOnce({ ok: true, novos: 1 });
    render(<Screen ids={["caso-a"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    let resolve: (result: NewCasesResult) => void = () => undefined;
    pollNewCasesAction.mockReturnValueOnce(
      new Promise<NewCasesResult>((done) => (resolve = done)),
    );
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    await act(async () => fireEvent.click(mostrar() as HTMLElement));
    await act(async () => resolve({ ok: true, novos: 4 }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("the poller never refreshes the page; only Mostrar does", async () => {
    pollNewCasesAction.mockResolvedValue({ ok: true, novos: 2 });
    render(<Screen ids={["caso-a"]} />);
    await advance(3 * FILA_NEW_CASES_INTERVAL_MS);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("a failed poll keeps the last state silently", async () => {
    pollNewCasesAction.mockResolvedValueOnce({ ok: true, novos: 2 });
    pollNewCasesAction.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    pollNewCasesAction.mockRejectedValueOnce(new Error("rede"));
    render(<Screen ids={["caso-a"]} />);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent("2 casos novos");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("SESSAO_EXPIRADA: the session-expiry path once, and no more polls", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      pathname: "/fila/caso-a",
      search: "",
      assign,
    });
    try {
      pollNewCasesAction.mockResolvedValue({
        ok: false,
        code: "SESSAO_EXPIRADA",
      });
      render(<Screen ids={["caso-a"]} />);
      await advance(3 * FILA_NEW_CASES_INTERVAL_MS);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith(
        expect.stringMatching(/^\/entrar\?motivo=sessao/),
      );
      expect(pollNewCasesAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Aguardando vendedor: no poll, no notice, nothing hidden", async () => {
    const { rerender } = render(
      <Screen ids={["caso-a"]} aba="aguardando" query="?aba=aguardando" />,
    );
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).not.toHaveBeenCalled();
    rerender(
      <Screen
        ids={["caso-novo", "caso-a"]}
        aba="aguardando"
        query="?aba=aguardando"
        renderedAt={2}
      />,
    );
    expect(options()).toEqual(["caso-novo", "caso-a"]);
  });

  it("a different list (Carregar mais, another tab) is a fresh snapshot: all its items show", async () => {
    const { rerender } = render(<Screen ids={["caso-a", "caso-b"]} />);
    rerender(
      <Screen
        ids={["caso-a", "caso-b", "caso-c"]}
        query="?ate=50"
        renderedAt={2}
        generatedAt={G2}
      />,
    );
    expect(options()).toEqual(["caso-a", "caso-b", "caso-c"]);
    await advance(FILA_NEW_CASES_INTERVAL_MS);
    expect(pollNewCasesAction).toHaveBeenLastCalledWith({ desde: G2 });
  });

  it("an open case outside the snapshot (a deep link) still shows, selected", () => {
    const { rerender } = render(<Screen ids={["caso-a", "caso-b"]} />);
    rerender(
      <Screen
        ids={["caso-novo", "caso-a", "caso-b"]}
        renderedAt={2}
        selectedId="caso-novo"
      />,
    );
    expect(options()).toEqual(["caso-novo", "caso-a", "caso-b"]);
  });
});
