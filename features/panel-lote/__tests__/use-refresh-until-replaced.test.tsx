import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useRefreshUntilReplaced } from "@/features/panel-lote/use-refresh-until-replaced";

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
