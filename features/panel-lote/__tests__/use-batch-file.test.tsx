import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WORKER_TIMEOUT_MS,
  useBatchFile,
} from "@/features/panel-lote/use-batch-file";

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: unknown[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  constructor(
    public url: URL,
    public options: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  answer(data: unknown): void {
    act(() => this.onmessage?.({ data } as MessageEvent));
  }
}

const PREVIEW = {
  kind: "preview",
  headers: ["CNPJ", "Responsável"],
  rows: [["11.222.333/0001-81", "Maria"]],
  stats: [
    { valid: 1, duplicates: 0, invalid: 0 },
    { valid: 0, duplicates: 0, invalid: 1 },
  ],
  detected: { cnpj: 0, responsavel: 1 },
};
const FILE = new File(["CNPJ\n11222333000181\n"], "segredo.csv");

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.useFakeTimers();
  consoleSpies = (["log", "warn", "error", "info"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  // C8: the hook never logs, not even a worker's error.
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  return renderHook(() => useBatchFile());
}

describe("useBatchFile (T75, ADR-0012 item 1, Security C8)", () => {
  it("creates no worker on mount", () => {
    const { result } = setup();
    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("creates a module worker on the first parse and posts the file", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    const [worker] = FakeWorker.instances;
    expect(worker?.options).toEqual({ type: "module" });
    expect(String(worker?.url)).toMatch(/\/parser\/parser\.worker\.ts/);
    expect(worker?.posted).toEqual([{ kind: "parse", file: FILE }]);
    expect(result.current.state).toEqual({ status: "reading" });
  });

  it("ignores the ready message, then shows a preview it re-checked", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    const worker = FakeWorker.instances[0];
    worker?.answer({ kind: "ready", version: "kybr-lote-parser/1" });
    expect(result.current.state).toEqual({ status: "reading" });
    worker?.answer(PREVIEW);
    expect(result.current.state).toEqual({
      status: "preview",
      preview: PREVIEW,
    });
  });

  it("a malformed answer → unreadable, and the worker is ended", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    const worker = FakeWorker.instances[0];
    worker?.answer({ ...PREVIEW, extra: "dado da planilha" });
    expect(result.current.state).toEqual({
      status: "error",
      error: "unreadable",
    });
    expect(worker?.terminated).toBe(true);
  });

  it("an error answer shows its code and ends the worker", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    FakeWorker.instances[0]?.answer({ kind: "error", error: "too_many" });
    expect(result.current.state).toEqual({
      status: "error",
      error: "too_many",
    });
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it.each(["onerror", "onmessageerror"] as const)(
    "a worker %s → unreadable (its message is never read)",
    (handler) => {
      const { result } = setup();
      act(() => result.current.parse(FILE));
      const worker = FakeWorker.instances[0];
      act(() =>
        worker?.[handler]?.(
          Object.assign(new Event("error"), {
            message: "SheetJS: célula 12.345.678",
          }) as never,
        ),
      );
      expect(result.current.state).toEqual({
        status: "error",
        error: "unreadable",
      });
      expect(worker?.terminated).toBe(true);
    },
  );

  it("20 s without an answer → unreadable, and the worker is ended", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    act(() => vi.advanceTimersByTime(WORKER_TIMEOUT_MS - 1));
    expect(result.current.state).toEqual({ status: "reading" });
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state).toEqual({
      status: "error",
      error: "unreadable",
    });
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(WORKER_TIMEOUT_MS).toBe(20_000);
  });

  it("an answer clears the timeout", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    FakeWorker.instances[0]?.answer(PREVIEW);
    act(() => vi.advanceTimersByTime(WORKER_TIMEOUT_MS * 2));
    expect(result.current.state.status).toBe("preview");
  });

  it("a second file while one is parsing cancels the first; its late answer is ignored", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    act(() => result.current.parse(FILE));
    const [first, second] = FakeWorker.instances;
    expect(first?.terminated).toBe(true);
    expect(second?.terminated).toBe(false);
    first?.answer(PREVIEW);
    expect(result.current.state).toEqual({ status: "reading" });
    second?.answer({ kind: "error", error: "empty" });
    expect(result.current.state).toEqual({ status: "error", error: "empty" });
  });

  it("build(column) posts it, resolves the payload, and ends the worker", async () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    const worker = FakeWorker.instances[0];
    worker?.answer(PREVIEW);
    let linhas: unknown;
    const pending = act(async () => {
      linhas = await result.current.build(0);
    });
    expect(worker?.posted.at(-1)).toEqual({ kind: "build", column: 0 });
    worker?.answer({ kind: "payload", linhas: [{ cnpj: "11222333000181" }] });
    await pending;
    expect(linhas).toEqual([{ cnpj: "11222333000181" }]);
    expect(worker?.terminated).toBe(true);
  });

  it("build without a preview resolves nothing", async () => {
    const { result } = setup();
    let linhas: unknown = "x";
    await act(async () => {
      linhas = await result.current.build(0);
    });
    expect(linhas).toBeUndefined();
  });

  it("build that times out → undefined and unreadable", async () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    FakeWorker.instances[0]?.answer(PREVIEW);
    let linhas: unknown = "x";
    const pending = act(async () => {
      linhas = await result.current.build(0);
    });
    act(() => vi.advanceTimersByTime(WORKER_TIMEOUT_MS));
    await pending;
    expect(linhas).toBeUndefined();
    expect(result.current.state).toEqual({
      status: "error",
      error: "unreadable",
    });
  });

  it("reset() ends the worker and goes back to idle", () => {
    const { result } = setup();
    act(() => result.current.parse(FILE));
    FakeWorker.instances[0]?.answer(PREVIEW);
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it("unmount ends the worker", () => {
    const { result, unmount } = setup();
    act(() => result.current.parse(FILE));
    unmount();
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });
});
