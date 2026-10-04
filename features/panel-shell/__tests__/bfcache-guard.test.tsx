import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BfcacheGuard } from "@/features/panel-shell/components/bfcache-guard";

const reload = vi.fn();

function pageshow(persisted: boolean): void {
  const event = new Event("pageshow") as Event & { persisted: boolean };
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BfcacheGuard (AC 8, P15)", () => {
  it("reloads a page restored from the back-forward cache, so the server decides again", () => {
    render(<BfcacheGuard />);
    pageshow(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves a normal load alone, and stops listening when unmounted", () => {
    const { unmount } = render(<BfcacheGuard />);
    pageshow(false);
    unmount();
    pageshow(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
