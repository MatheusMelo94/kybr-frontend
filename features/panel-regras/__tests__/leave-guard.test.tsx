import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  guardedHref,
  useLeaveGuard,
} from "@/features/panel-regras/use-leave-guard";

// T145 (plan-m8 D8, Q3, Security O-F9): the leave guard acts only on
// same-origin, non-download, unmodified left-clicks on links; everything
// else passes untouched. beforeunload covers reload and close.

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/regras");
});

function anchor(attributes: Record<string, string>): HTMLAnchorElement {
  const a = document.createElement("a");
  for (const [name, value] of Object.entries(attributes))
    a.setAttribute(name, value);
  a.textContent = "link";
  document.body.append(a);
  return a;
}

function click(target: Element, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
}

describe("guardedHref (O-F9)", () => {
  const ORIGIN = window.location.origin;

  it.each([
    ["a middle click", { href: "/fila" }, { button: 1 }],
    ["Ctrl-click", { href: "/fila" }, { ctrlKey: true }],
    ["Cmd-click", { href: "/fila" }, { metaKey: true }],
    ["Shift-click", { href: "/fila" }, { shiftKey: true }],
    ["Alt-click", { href: "/fila" }, { altKey: true }],
    ["target=_blank", { href: "/fila", target: "_blank" }, {}],
    ["another origin", { href: "https://exemplo.test/x" }, {}],
    ["a download", { href: "/vendedores/exportar.csv", download: "" }, {}],
    ["an in-page hash", { href: "#conteudo" }, {}],
  ] as const)("passes %s untouched", (_name, attributes, init) => {
    const a = anchor(attributes);
    expect(guardedHref(click(a, init), a, ORIGIN)).toBeNull();
  });

  it("guards a plain left-click on a same-origin link", () => {
    const a = anchor({ href: "/fila?aba=aguardando" });
    expect(guardedHref(click(a), a, ORIGIN)).toBe("/fila?aba=aguardando");
  });
});

function Harness({ dirty }: { dirty: boolean }) {
  const guard = useLeaveGuard(dirty);
  return (
    <div>
      <a href="/fila">Fila</a>
      <a href="/fila" target="_blank">
        Nova aba
      </a>
      <span data-testid="pending">
        {typeof guard.pending === "string"
          ? guard.pending
          : guard.pending === null
            ? ""
            : "action"}
      </span>
      <button type="button" onClick={guard.stay}>
        stay
      </button>
      <button type="button" onClick={guard.leave}>
        leave
      </button>
    </div>
  );
}

describe("useLeaveGuard", () => {
  it("dirty: a nav link is held for the dialog; leave goes there softly, stay stays", () => {
    render(<Harness dirty />);
    const event = click(screen.getByText("Fila"));
    act(() => {
      screen.getByText("Fila").dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId("pending").textContent).toBe("/fila");
    fireEvent.click(screen.getByText("stay"));
    expect(screen.getByTestId("pending").textContent).toBe("");
    expect(router.push).not.toHaveBeenCalled();

    act(() => {
      screen.getByText("Fila").dispatchEvent(click(screen.getByText("Fila")));
    });
    fireEvent.click(screen.getByText("leave"));
    expect(router.push).toHaveBeenCalledWith("/fila", expect.anything());
  });

  it("dirty: a new-tab link passes untouched", () => {
    render(<Harness dirty />);
    const link = screen.getByText("Nova aba");
    const event = click(link);
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByTestId("pending").textContent).toBe("");
  });

  it("clean: no guard and no beforeunload prompt", () => {
    render(<Harness dirty={false} />);
    const event = click(screen.getByText("Fila"));
    screen.getByText("Fila").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("dirty: beforeunload asks the browser's native prompt", () => {
    render(<Harness dirty />);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
});
