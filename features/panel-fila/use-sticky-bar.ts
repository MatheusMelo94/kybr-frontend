"use client";

import { useEffect, useState, type RefObject } from "react";

import { LG_MEDIA } from "@/features/panel-fila/limits";

/**
 * Whether the case's action bar may stick to the bottom below lg (T112).
 * Q18: a bar taller than a third of the viewport (200 % text at 360 × 780)
 * isn't sticky; it sits at the end of the content. While it sticks, the
 * page's scroll-padding-bottom is its height, so a control that takes focus
 * is scrolled clear of it (J4.3). Measured on mount and on every resize.
 */
export function useStickyBar(bar: RefObject<HTMLElement | null>): boolean {
  const [sticky, setSticky] = useState(true);

  useEffect(() => {
    const element = bar.current;
    if (element === null) return;
    const root = document.documentElement;
    const measure = () => {
      const height = element.offsetHeight;
      const fits = height <= window.innerHeight / 3;
      setSticky(fits);
      root.style.scrollPaddingBottom =
        fits && !window.matchMedia(LG_MEDIA).matches ? `${height}px` : "";
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      root.style.scrollPaddingBottom = "";
    };
  }, [bar]);

  return sticky;
}
