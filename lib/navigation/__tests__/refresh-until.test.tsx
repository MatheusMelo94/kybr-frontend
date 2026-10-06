import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useRefreshUntil, useRefreshUntilReplaced } from "@/lib/navigation/refresh-until";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRefreshUntilReplaced", () => {
  it("refreshes now, then every 2 s while still mounted, at most 5 times", () => {
    const { result } = renderHook(() => useRefreshUntilReplaced());
    act(() => result.current());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).toHaveBeenCalledTimes(5);
  });

  it("stops once the component is replaced (unmounted)", () => {
    const { result, unmount } = renderHook(() => useRefreshUntilReplaced());
    act(() => result.current());
    unmount();
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("useRefreshUntil (the Fila's decided id / renderedAt, T90)", () => {
  it("refreshes now and every 2 s while the predicate is false", () => {
    const giveUp = vi.fn();
    const { result } = renderHook(() => useRefreshUntil(() => false, giveUp));
    act(() => result.current());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2_000));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(4_000));
    expect(router.refresh).toHaveBeenCalledTimes(4);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("stops once the predicate holds, without a full navigation", () => {
    let done = false;
    const giveUp = vi.fn();
    const { result } = renderHook(() => useRefreshUntil(() => done, giveUp));
    act(() => result.current());
    act(() => vi.advanceTimersByTime(2_000));
    done = true;
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("after 5 refreshes that didn't take, loads the current URL fully, once", () => {
    window.history.replaceState(null, "", "/fila?caso=abc");
    const giveUp = vi.fn();
    const { result } = renderHook(() => useRefreshUntil(() => false, giveUp));
    act(() => result.current());
    act(() => vi.advanceTimersByTime(60_000));
    expect(router.refresh).toHaveBeenCalledTimes(5);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(giveUp).toHaveBeenCalledWith("/fila?caso=abc");
  });

  it("does nothing when the predicate already holds", () => {
    const giveUp = vi.fn();
    const { result } = renderHook(() => useRefreshUntil(() => true, giveUp));
    act(() => result.current());
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("reads the latest predicate on each tick", () => {
    const giveUp = vi.fn();
    const { result, rerender } = renderHook(({ done }) => useRefreshUntil(() => done, giveUp), {
      initialProps: { done: false },
    });
    act(() => result.current());
    rerender({ done: true });
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops when unmounted", () => {
    const giveUp = vi.fn();
    const { result, unmount } = renderHook(() => useRefreshUntil(() => false, giveUp));
    act(() => result.current());
    unmount();
    act(() => vi.advanceTimersByTime(20_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(giveUp).not.toHaveBeenCalled();
  });
});
