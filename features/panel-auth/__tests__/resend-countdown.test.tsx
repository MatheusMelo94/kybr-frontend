import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResendCountdown } from "@/features/panel-auth/components/resend-countdown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ResendCountdown (AC 3)", () => {
  it("is disabled with confirm.resend.wait counting down, then enabled", () => {
    const onResend = vi.fn();
    render(
      <ResendCountdown
        availableInMs={60_000}
        restartKey={0}
        onResend={onResend}
        busy={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Reenviar em 60 s" }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(
      screen.getByRole("button", { name: "Reenviar em 59 s" }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(59_000));

    const button = screen.getByRole("button", { name: "Reenviar código" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onResend).toHaveBeenCalledOnce();
  });

  it("restarts with a new wait", () => {
    const props = { onResend: vi.fn(), busy: false };
    const { rerender } = render(
      <ResendCountdown availableInMs={0} restartKey={0} {...props} />,
    );
    expect(
      screen.getByRole("button", { name: "Reenviar código" }),
    ).toBeEnabled();

    rerender(
      <ResendCountdown availableInMs={60_000} restartKey={1} {...props} />,
    );
    expect(
      screen.getByRole("button", { name: "Reenviar em 60 s" }),
    ).toBeDisabled();
  });
});
