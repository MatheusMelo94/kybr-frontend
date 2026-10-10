import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAction } from "@/features/panel-fila/call-action";
import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";

type R = { ok: true } | { ok: false; code: string };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("callAction (F6: try/catch + DECIDE_TIMEOUT_MS)", () => {
  it("passes the input and answers the action's result", async () => {
    const action = vi.fn(async (input: unknown): Promise<R> => {
      void input;
      return { ok: true };
    });
    expect(await callAction(action, { a: 1 })).toEqual({ ok: true });
    expect(action).toHaveBeenCalledWith({ a: 1 });
  });

  it("a rejected call (network, a 404, a 500, deployment skew) → NETWORK, never a throw", async () => {
    const action = vi.fn(async (): Promise<R> => {
      throw new TypeError("Failed to fetch");
    });
    expect(await callAction(action, {})).toEqual({
      ok: false,
      code: "NETWORK",
    });
  });

  it("no result by DECIDE_TIMEOUT_MS → NETWORK (unknown outcome); the late result goes to onLate only", async () => {
    let resolve: (value: R) => void = () => undefined;
    const action = vi.fn(() => new Promise<R>((done) => (resolve = done)));
    const onLate = vi.fn();
    const settled = vi.fn();
    void callAction(action, {}, { onLate }).then(settled);
    await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith({ ok: false, code: "NETWORK" });
    resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith({ ok: true });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("a late rejection reaches onLate as NETWORK", async () => {
    let reject: (error: Error) => void = () => undefined;
    const action = vi.fn(() => new Promise<R>((_, fail) => (reject = fail)));
    const onLate = vi.fn();
    void callAction(action, {}, { onLate });
    await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS);
    reject(new Error("x"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith({ ok: false, code: "NETWORK" });
  });

  it("an in-time result never calls onLate", async () => {
    const onLate = vi.fn();
    await callAction(async (): Promise<R> => ({ ok: true }), {}, { onLate });
    await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS * 2);
    expect(onLate).not.toHaveBeenCalled();
  });
});
