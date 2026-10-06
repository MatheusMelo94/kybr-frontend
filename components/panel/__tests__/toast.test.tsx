import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_EXIT_MS,
  TOAST_MS,
  ToastProvider,
  useToast,
} from "@/components/panel/toast";

function Trigger({ message }: { message: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(message)}>
      mostrar {message}
    </button>
  );
}

function renderToasts(...messages: string[]) {
  render(
    <ToastProvider closeLabel="Fechar">
      {messages.map((message) => (
        <Trigger key={message} message={message} />
      ))}
    </ToastProvider>,
  );
  return (message: string) =>
    fireEvent.click(screen.getByRole("button", { name: `mostrar ${message}` }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider (T76, spec § Motion Intent)", () => {
  it("renders one polite live region at first paint, empty", () => {
    renderToasts("a");
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
  });

  it("shows a toast inside that region, and takes no focus", () => {
    const show = renderToasts("1 caso na fila");
    const button = screen.getByRole("button", {
      name: "mostrar 1 caso na fila",
    });
    button.focus();
    show("1 caso na fila");

    expect(screen.getByRole("status")).toHaveTextContent("1 caso na fila");
    expect(button).toHaveFocus();
  });

  it("stays 5 s, then leaves (exit at --duration-fast) and is removed", () => {
    const show = renderToasts("a");
    show("a");
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.getByText("a", { selector: "p" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    const leaving = screen
      .getByText("a", { selector: "p" })
      .closest("[data-leaving]");
    expect(leaving).not.toBeNull();
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(screen.queryByText("a", { selector: "p" })).not.toBeInTheDocument();
    expect(TOAST_MS).toBe(5_000);
    expect(TOAST_EXIT_MS).toBe(150);
  });

  it("pauses while hovered, and resumes with the time it had left", () => {
    const show = renderToasts("a");
    show("a");
    act(() => vi.advanceTimersByTime(3_000));
    const toast = screen.getByText("a", { selector: "p" })
      .parentElement as HTMLElement;
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("a", { selector: "p" })).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1_999));
    expect(toast).not.toHaveAttribute("data-leaving");
    act(() => vi.advanceTimersByTime(1));
    expect(toast).toHaveAttribute("data-leaving");
  });

  it("pauses while focus is inside it", () => {
    const show = renderToasts("a");
    show("a");
    const close = screen.getByRole("button", { name: "Fechar" });
    act(() => close.focus());
    act(() => vi.advanceTimersByTime(10_000));
    expect(close.closest("[data-leaving]")).toBeNull();
    act(() => close.blur());
    act(() => vi.advanceTimersByTime(5_000));
    expect(close.closest("[data-leaving]")).not.toBeNull();
  });

  it("has a close button (common.close) with a ≥ 24 px target, ≥ 44 px on coarse pointers", () => {
    const show = renderToasts("a");
    show("a");
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close).toHaveClass(
      "min-h-6",
      "min-w-6",
      "pointer-coarse:min-h-11",
      "pointer-coarse:min-w-11",
    );
    fireEvent.click(close);
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(screen.queryByText("a", { selector: "p" })).not.toBeInTheDocument();
  });

  it("stacks at most 3: a 4th drops the oldest", () => {
    const show = renderToasts("um", "dois", "três", "quatro");
    for (const message of ["um", "dois", "três", "quatro"]) show(message);
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    const texts = screen
      .getAllByText(/^(um|dois|três|quatro)$/, { selector: "p" })
      .map((element) => element.textContent);
    expect(texts).toEqual(["dois", "três", "quatro"]);
  });

  it("a line border, no shadow; motion classes for enter, exit and reduced motion", () => {
    const show = renderToasts("a");
    show("a");
    const toast = screen.getByText("a", { selector: "p" })
      .parentElement as HTMLElement;
    expect(toast).toHaveClass("border", "border-line");
    expect(toast.className).not.toMatch(/shadow/);
    // Computed transitions under both motion settings: primitives.spec.
  });

  it("useToast outside the provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/);
  });
});
