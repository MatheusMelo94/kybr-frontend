import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { STALL_MS, useSoftNavigate } from "@/lib/navigation/soft-navigate";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/lote/abc?status=erro");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSoftNavigate (the Next 15.5 soft-navigation stall, T83)", () => {
  it("replaces the URL softly, without scrolling", () => {
    const { result } = renderHook(() => useSoftNavigate(vi.fn()));
    act(() => result.current("/lote/abc"));
    expect(router.replace).toHaveBeenCalledWith("/lote/abc", { scroll: false });
  });

  it("if the URL didn't change after 4 s, it navigates fully to the same URL", () => {
    const stalled = vi.fn();
    const { result } = renderHook(() => useSoftNavigate(stalled));
    act(() => result.current("/lote/abc"));
    act(() => vi.advanceTimersByTime(STALL_MS - 1));
    expect(stalled).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(stalled).toHaveBeenCalledWith("/lote/abc");
    expect(STALL_MS).toBe(4_000);
  });

  it("does nothing more when the soft navigation committed", () => {
    const stalled = vi.fn();
    const { result } = renderHook(() => useSoftNavigate(stalled));
    act(() => result.current("/lote/abc?cursor=bzoyNQ"));
    window.history.replaceState(null, "", "/lote/abc?cursor=bzoyNQ");
    act(() => vi.advanceTimersByTime(STALL_MS));
    expect(stalled).not.toHaveBeenCalled();
  });

  it("a newer navigation cancels the older check", () => {
    const stalled = vi.fn();
    const { result } = renderHook(() => useSoftNavigate(stalled));
    act(() => result.current("/lote/abc"));
    act(() => result.current("/lote/abc?status=bad"));
    act(() => vi.advanceTimersByTime(STALL_MS));
    expect(stalled).toHaveBeenCalledTimes(1);
    expect(stalled).toHaveBeenCalledWith("/lote/abc?status=bad");
  });

  it("can push instead (opening a case, T99), scrolling when asked", () => {
    const { result } = renderHook(() => useSoftNavigate(vi.fn()));
    act(() => result.current("/fila/x?ate=50", { push: true, scroll: true }));
    expect(router.push).toHaveBeenCalledWith("/fila/x?ate=50", {
      scroll: true,
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
