"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

export type Collapse = {
  /**
   * Before the optimistic removal: record where each option sits, and a
   * snapshot of `leavingId`'s option. Cancels a collapse still running.
   */
  capture(leavingId?: string): void;
  /** After the list re-rendered without the case: close the gap (once). */
  play(): void;
};

const OPTION = '[role="option"]';

/** The case id (Listbox's data-id), or the element id. */
const keyOf = (option: HTMLElement): string => option.dataset.id ?? option.id;
const REDUCE = "(prefers-reduced-motion: reduce)";

type Captured = {
  tops: Map<string, number>;
  ghost: HTMLElement | null;
};

/** --duration-base in ms (250 if the token can't be read). */
function duration(root: Element): number {
  const value = getComputedStyle(root)
    .getPropertyValue("--duration-base")
    .trim();
  const ms = value.endsWith("ms")
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : 250;
}

function easing(root: Element): string {
  return (
    getComputedStyle(root).getPropertyValue("--ease-out-quart").trim() ||
    "ease-out"
  );
}

/** An inert copy of the leaving option, placed where it was in `list`. */
function snapshot(option: HTMLElement, list: HTMLElement): HTMLElement {
  const box = option.getBoundingClientRect();
  const origin = list.getBoundingClientRect();
  const ghost = option.cloneNode(true) as HTMLElement;
  for (const element of [ghost, ...ghost.querySelectorAll("*")]) {
    element.removeAttribute("id");
    element.removeAttribute("role");
    element.removeAttribute("aria-selected");
    element.removeAttribute("data-id");
    element.removeAttribute("data-active");
  }
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("data-collapse-ghost", "");
  Object.assign(ghost.style, {
    position: "absolute",
    top: `${box.top - origin.top + list.scrollTop}px`,
    left: `${box.left - origin.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    pointerEvents: "none",
  });
  return ghost;
}

/**
 * The list's collapse when a decided case leaves it (plan-m6 § 7, D12): a
 * hand-rolled WAAPI FLIP, no GSAP (the user's decision, Q2; the lint fence).
 * capture() records each option's top relative to `listRef` (which must be
 * positioned) and an inert snapshot of the leaving one; play() moves every
 * remaining option from its old place (translateY Δ → none) and fades the
 * snapshot by opacity, then removes it. Transform and opacity only, over
 * --duration-base with --ease-out-quart. Reduced motion: nothing animates
 * (an instant removal). A new capture() and unmount cancel what's running.
 */
export function useCollapse(listRef: RefObject<HTMLElement | null>): Collapse {
  const captured = useRef<Captured | null>(null);
  const running = useRef<{
    animations: Animation[];
    ghost: HTMLElement | null;
  }>({ animations: [], ghost: null });

  const stop = useCallback(() => {
    for (const animation of running.current.animations) animation.cancel();
    running.current.ghost?.remove();
    running.current = { animations: [], ghost: null };
  }, []);

  useEffect(
    () => () => {
      stop();
      captured.current = null;
    },
    [stop],
  );

  const capture = useCallback(
    (leavingId?: string) => {
      stop();
      captured.current = null;
      const list = listRef.current;
      if (list === null || typeof list.animate !== "function") return;
      if (window.matchMedia(REDUCE).matches) return;
      const origin = list.getBoundingClientRect().top;
      const tops = new Map<string, number>();
      let ghost: HTMLElement | null = null;
      for (const option of list.querySelectorAll<HTMLElement>(OPTION)) {
        tops.set(keyOf(option), option.getBoundingClientRect().top - origin);
        if (keyOf(option) === leavingId) ghost = snapshot(option, list);
      }
      captured.current = { tops, ghost };
    },
    [listRef, stop],
  );

  const play = useCallback(() => {
    const before = captured.current;
    captured.current = null;
    const list = listRef.current;
    if (before === null || list === null) return;
    const root = document.documentElement;
    const timing = { duration: duration(root), easing: easing(root) };
    const origin = list.getBoundingClientRect().top;
    const animations: Animation[] = [];
    for (const option of list.querySelectorAll<HTMLElement>(OPTION)) {
      const was = before.tops.get(keyOf(option));
      if (was === undefined) continue;
      const delta = was - (option.getBoundingClientRect().top - origin);
      if (delta === 0) continue;
      animations.push(
        option.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
          timing,
        ),
      );
    }
    const ghost = before.ghost;
    if (ghost !== null) {
      list.append(ghost);
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], timing);
      fade.onfinish = () => ghost.remove();
      animations.push(fade);
    }
    running.current = { animations, ghost };
  }, [listRef]);

  return useMemo(() => ({ capture, play }), [capture, play]);
}
