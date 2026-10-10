import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardError } from "@/features/panel-home/components/card-error";

// T134 hardening of T132's retry: a refresh Next 15.5 drops five times in a
// row falls back to one full load (the Fila's useRefreshUntil), so the card
// can't stay stuck on home.card.error.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
const fullNavigate = vi.fn();
vi.mock("@/lib/navigation/soft-navigate", () => ({
  fullNavigate: (url: string) => fullNavigate(url),
}));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  fullNavigate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("CardError retry", () => {
  it("refreshes now, retries every 2 s, and loads the page fully after the fifth", () => {
    render(<CardError />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refresh).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10_000));
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(fullNavigate).toHaveBeenCalledOnce();
  });

  it("replaced by the card (unmounted): no further refresh, no full load", () => {
    const { unmount } = render(<CardError />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(refresh).toHaveBeenCalledOnce();
    expect(fullNavigate).not.toHaveBeenCalled();
  });
});
