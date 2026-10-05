import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-auth/actions", () => ({ logoutAction }));

import { LogoutItem } from "@/features/panel-shell/components/logout-item";

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogoutItem (AC 8, P15)", () => {
  it("is a menuitem submit button inside a POST form, never a link", () => {
    render(<LogoutItem />);
    const item = screen.getByRole("menuitem", { name: "Sair" });
    expect(item.tagName).toBe("BUTTON");
    expect(item).toHaveAttribute("type", "submit");
    expect(item.closest("form")).not.toBeNull();
  });

  it("posts straight to logoutAction, which owns the redirect: no client navigation races it", async () => {
    logoutAction.mockResolvedValue(undefined);
    render(<LogoutItem />);
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
    });

    expect(logoutAction).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
