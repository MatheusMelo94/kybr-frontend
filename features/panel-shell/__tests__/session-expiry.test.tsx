import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SessionExpiryProvider,
  useDialogDraft,
} from "@/features/panel-shell/components/session-expiry-provider";
import {
  sessionExpiredHref,
  useSessionExpiry,
} from "@/features/panel-shell/use-session-expiry";

const assign = vi.fn();

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", {
    ...window.location,
    pathname: "/fila/abc",
    search: "?aba=x",
    assign,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Expire() {
  const expire = useSessionExpiry();
  return (
    <button type="button" onClick={expire}>
      expirar
    </button>
  );
}

function Draft({ dirty }: { dirty: boolean }) {
  useDialogDraft(dirty);
  return null;
}

describe("sessionExpiredHref (AC 7)", () => {
  it.each([
    [
      "/fila/abc?aba=x",
      false,
      "/entrar?motivo=sessao&volta=%2Ffila%2Fabc%3Faba%3Dx",
    ],
    ["/fila", true, "/entrar?motivo=sessao&volta=%2Ffila&perdido=1"],
    ["/v/x", false, "/entrar?motivo=sessao"],
  ])("%s (lost: %s) → %s", (current, lost, href) => {
    expect(sessionExpiredHref(current, lost)).toBe(href);
  });
});

describe("useSessionExpiry", () => {
  it("navigates to /entrar with the current screen as volta, with a full load", () => {
    render(<Expire />);
    act(() => screen.getByRole("button").click());

    expect(assign).toHaveBeenCalledWith(
      "/entrar?motivo=sessao&volta=%2Ffila%2Fabc%3Faba%3Dx",
    );
  });

  it("adds perdido=1 when a dialog holds unsent input", () => {
    render(
      <SessionExpiryProvider>
        <Draft dirty />
        <Expire />
      </SessionExpiryProvider>,
    );
    act(() => screen.getByRole("button").click());

    expect(assign).toHaveBeenCalledWith(
      "/entrar?motivo=sessao&volta=%2Ffila%2Fabc%3Faba%3Dx&perdido=1",
    );
  });

  it("a clean dialog doesn't count", () => {
    render(
      <SessionExpiryProvider>
        <Draft dirty={false} />
        <Expire />
      </SessionExpiryProvider>,
    );
    act(() => screen.getByRole("button").click());

    expect(assign).toHaveBeenCalledWith(expect.not.stringContaining("perdido"));
  });

  it("navigates once, however many callers expire (no loop, no duplicate navigation)", () => {
    render(
      <SessionExpiryProvider>
        <Expire />
        <Expire />
      </SessionExpiryProvider>,
    );
    act(() => {
      for (const button of screen.getAllByRole("button")) button.click();
    });

    expect(assign).toHaveBeenCalledTimes(1);
  });
});
