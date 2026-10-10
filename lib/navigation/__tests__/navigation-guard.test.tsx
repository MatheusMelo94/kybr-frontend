import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useNavigationGuard } from "@/lib/navigation/navigation-guard";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/fila/caso-a?ate=50");
});

describe("useNavigationGuard (plan-m6 § 18: origin, generation, liveness)", () => {
  it("a fresh guard is still here, with the origin it was armed on", () => {
    const { result } = renderHook(() => useNavigationGuard());
    const guard = result.current();
    expect(guard.origin).toBe("/fila/caso-a?ate=50");
    expect(guard.stillHere()).toBe(true);
    expect(guard.onOrigin()).toBe(true);
  });

  it("origin: the location moved (a link, Voltar) → not here", () => {
    const { result } = renderHook(() => useNavigationGuard());
    const guard = result.current();
    window.history.pushState(null, "", "/lote");
    expect(guard.stillHere()).toBe(false);
    expect(guard.onOrigin()).toBe(false);
  });

  it("generation: a newer soft navigation started (not committed yet) → not here", () => {
    const { result } = renderHook(() => ({
      arm: useNavigationGuard(),
      navigate: useSoftNavigate(vi.fn()),
    }));
    const guard = result.current.arm();
    act(() => result.current.navigate("/fila/caso-b?ate=50"));
    expect(window.location.pathname).toBe("/fila/caso-a");
    expect(guard.stillHere()).toBe(false);
    expect(guard.onOrigin()).toBe(false);
  });

  it("liveness: after unmount stillHere() is false; onOrigin() ignores liveness", () => {
    const { result, unmount } = renderHook(() => useNavigationGuard());
    const guard = result.current();
    unmount();
    expect(guard.stillHere()).toBe(false);
    expect(guard.onOrigin()).toBe(true);
  });
});
