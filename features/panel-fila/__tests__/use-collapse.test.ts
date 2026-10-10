import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// T114: the WAAPI FLIP (AC 70, Fila half; plan-m6 § 7, D12).
describe("useCollapse (T114 FLIP)", () => {
  type Fake = {
    el: Element;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
    onfinish: (() => void) | null;
    oncancel: (() => void) | null;
  };
  let animations: Fake[];
  let tops: Map<string, number>;
  let reduce: boolean;

  beforeEach(() => {
    animations = [];
    tops = new Map();
    reduce = false;
    document.documentElement.style.setProperty("--duration-base", "250ms");
    document.documentElement.style.setProperty(
      "--ease-out-quart",
      "cubic-bezier(0.25, 1, 0.5, 1)",
    );
    window.matchMedia = vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
    })) as unknown as typeof window.matchMedia;
    Element.prototype.animate = vi.fn(function (
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const fake: Fake = {
        el: this,
        keyframes,
        options,
        cancel: vi.fn(() => fake.oncancel?.()),
        onfinish: null,
        oncancel: null,
      };
      animations.push(fake);
      return fake as unknown as Animation;
    }) as unknown as Element["animate"];
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const top = tops.get(this.id) ?? 0;
        return {
          top,
          left: 0,
          width: 300,
          height: 50,
          bottom: top + 50,
          right: 300,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("style");
  });

  function three(): HTMLDivElement {
    const element = document.createElement("div");
    element.id = "lista";
    element.innerHTML = ["a", "b", "c"]
      .map((id) => `<div role="option" id="${id}">${id}</div>`)
      .join("");
    document.body.append(element);
    tops.set("lista", 0).set("a", 0).set("b", 50).set("c", 100);
    return element;
  }

  /** The list re-rendered without `a`: b and c moved up by 50 px. */
  function removeA(element: HTMLElement): void {
    element.querySelector("#a")?.remove();
    tops.set("b", 0).set("c", 50);
  }

  const snapshots = () => document.querySelectorAll("[data-collapse-ghost]");

  it("moves each remaining option from where it was (translateY Δ → none) over --duration-base with the motion easing", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();

    const moves = animations.filter(
      (a) => a.el.getAttribute("role") === "option",
    );
    expect(moves.map((a) => a.el.id)).toEqual(["b", "c"]);
    for (const move of moves) {
      expect(move.keyframes).toEqual([
        { transform: "translateY(50px)" },
        { transform: "none" },
      ]);
      expect(move.options).toMatchObject({
        duration: 250,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
      });
    }
  });

  it("the leaving option is a positioned, hidden snapshot that fades by opacity and is removed when done", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();

    const [ghost] = Array.from(snapshots()) as HTMLElement[];
    expect(ghost).toBeDefined();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost?.hasAttribute("id")).toBe(false);
    expect(ghost?.hasAttribute("role")).toBe(false);
    expect(ghost?.querySelector("[id]")).toBeNull();
    expect(ghost?.style.position).toBe("absolute");
    expect(ghost?.style.top).toBe("0px");
    const fade = animations.find((a) => a.el === ghost);
    expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    fade?.onfinish?.();
    expect(snapshots()).toHaveLength(0);
  });

  it("animates transform and opacity only, never a layout property", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations)
      for (const frame of animation.keyframes)
        for (const key of Object.keys(frame))
          expect(["transform", "opacity"]).toContain(key);
  });

  it("reduced motion: no animate() at all and no snapshot (an instant removal)", () => {
    reduce = true;
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(snapshots()).toHaveLength(0);
  });

  it("a new capture() cancels the running collapse and leaves no snapshot behind", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();
    const first = [...animations];
    result.current.capture("b");
    for (const animation of first) expect(animation.cancel).toHaveBeenCalled();
    expect(snapshots()).toHaveLength(0);
  });

  it("play() runs once per capture(): a second play() does nothing", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("a");
    removeA(element);
    result.current.play();
    const count = animations.length;
    result.current.play();
    expect(animations).toHaveLength(count);
  });

  it("unmount cancels the running collapse and removes the snapshot", () => {
    const element = three();
    const { result, unmount } = renderHook(() =>
      useCollapse({ current: element }),
    );
    result.current.capture("a");
    removeA(element);
    result.current.play();
    unmount();
    for (const animation of animations)
      expect(animation.cancel).toHaveBeenCalled();
    expect(snapshots()).toHaveLength(0);
  });

  it("an option that didn't move isn't animated", () => {
    const element = three();
    const { result } = renderHook(() => useCollapse({ current: element }));
    result.current.capture("c");
    element.querySelector("#c")?.remove();
    result.current.play();
    expect(
      animations.filter((a) => a.el.getAttribute("role") === "option"),
    ).toHaveLength(0);
  });
});
