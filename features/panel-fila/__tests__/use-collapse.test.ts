import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useCollapse } from "@/features/panel-fila/use-collapse";

// T113: the collapse's contract (plan-m6 § 7, D12). useDecide calls
// capture() before the optimistic removal and play() after the list
// re-renders without the case. T114 fills in the WAAPI FLIP.

afterEach(() => {
  document.body.innerHTML = "";
});

function list(): HTMLUListElement {
  const element = document.createElement("ul");
  element.innerHTML =
    '<li role="option" id="a">a</li><li role="option" id="b">b</li>';
  document.body.append(element);
  return element;
}

describe("useCollapse (T113 contract)", () => {
  it("returns capture() and play()", () => {
    const ref = { current: list() };
    const { result } = renderHook(() => useCollapse(ref));
    expect(typeof result.current.capture).toBe("function");
    expect(typeof result.current.play).toBe("function");
  });

  it("play() with no prior capture() is safe", () => {
    const ref = { current: list() };
    const { result } = renderHook(() => useCollapse(ref));
    expect(() => result.current.play()).not.toThrow();
  });

  it("capture() then play() is safe, and leaves the list as it was", () => {
    const element = list();
    const ref = { current: element };
    const { result } = renderHook(() => useCollapse(ref));
    const before = element.outerHTML;
    result.current.capture();
    element.firstElementChild?.remove();
    result.current.play();
    expect(element.querySelectorAll("li")).toHaveLength(1);
    expect(element.outerHTML).not.toBe(before);
    expect(document.body.querySelectorAll("li")).toHaveLength(1);
  });

  it("with no list mounted (a null ref), both are no-ops", () => {
    const ref = createRef<HTMLUListElement>();
    const { result } = renderHook(() => useCollapse(ref));
    expect(() => {
      result.current.capture();
      result.current.play();
    }).not.toThrow();
  });

  it("after the hook's owner unmounts, both are no-ops", () => {
    const ref = { current: list() };
    const { result, unmount } = renderHook(() => useCollapse(ref));
    const { capture, play } = result.current;
    unmount();
    ref.current = null as unknown as HTMLUListElement;
    expect(() => {
      capture();
      play();
    }).not.toThrow();
  });
});
