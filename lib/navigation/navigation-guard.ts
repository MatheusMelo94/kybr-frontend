"use client";

import { useCallback, useEffect, useRef } from "react";

// plan-m6 § 18 (the R1 post-mortem): anything that can act after the render
// that armed it (a timer, an await continuation) is guarded three ways, since
// unmount cleanup can't cancel what is armed after it ran:
// 1. origin: the location is still the one it was armed on;
// 2. generation: no newer soft navigation started (it may not have committed);
// 3. liveness: the component that armed it is still mounted.
// Navigations, refreshes and focus moves pass all three; toasts may run
// regardless; plain state updates need only liveness.
// Pre-Convention: proposed for FA § Data Fetching & Mutations (plan-m6 § 17
// drift item 7), pending the Architect.

/** The current path + query: what the guards compare. */
export function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

// Every soft navigation, from any instance, takes the next generation.
let generation = 0;

/** A soft navigation starts: older guards and stall timers go inert. */
export function nextNavigationGeneration(): number {
  generation += 1;
  return generation;
}

export function navigationGeneration(): number {
  return generation;
}

export type NavigationGuard = {
  /** currentUrl() when armed. */
  origin: string;
  /** Still on the origin, with no newer soft navigation. */
  onOrigin: () => boolean;
  /** onOrigin() and the arming component is still mounted. */
  stillHere: () => boolean;
};

/** Arms a guard (in an event handler, before an await) for this component. */
export function useNavigationGuard(): () => NavigationGuard {
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return useCallback(() => {
    const origin = currentUrl();
    const gen = generation;
    const onOrigin = () => gen === generation && currentUrl() === origin;
    return {
      origin,
      onOrigin,
      stillHere: () => alive.current && onOrigin(),
    };
  }, []);
}
