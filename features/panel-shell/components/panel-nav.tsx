"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type JSX } from "react";

import {
  MonitorCount,
  NavCount,
} from "@/features/panel-shell/components/nav-count";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import type { NavItem } from "@/features/panel-shell/nav";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { cn } from "@/lib/utils";

type Props = {
  items: readonly NavItem[];
  /** "sidebar" at lg and up; "tabs": the scrolling row below it (AC 10). */
  variant?: "sidebar" | "tabs";
};

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The panel's nav (AC 9): the build's items, the active one marked, the
 * Fila's and Monitoramento's counts from the shell's live status (missing
 * hides them, AC 11), and
 * Lote's nav.lote.running while a batch runs (S5).
 */
export function PanelNav({ items, variant = "sidebar" }: Props): JSX.Element {
  // The external path: the ADR-0008 spike proved usePathname() sees it under the rewrite.
  const pathname = usePathname();
  const tabs = variant === "tabs";
  const { contagens: counts, loteRunning } = useShellStatus();
  const activeLink = useRef<HTMLAnchorElement>(null);

  // The active tab in view on load, inside the row only (instant under reduced motion).
  useEffect(() => {
    if (!tabs) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    activeLink.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: reduce ? "instant" : "smooth",
    });
  }, [tabs, pathname]);

  return (
    <nav aria-label={shellCopy["nav.label"]}>
      <ul
        className={cn(
          "flex gap-1",
          tabs
            ? "flex-row overflow-x-auto overscroll-x-contain px-4"
            : "flex-col",
        )}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} className={cn(tabs && "shrink-0")}>
              <Link
                ref={active ? activeLink : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // relative: the counts' sr-only text stays inside the tab row's
                  // scroll box instead of widening the page (AC 74).
                  "relative flex min-h-10 flex-wrap items-center gap-x-2 rounded-md px-3 py-2 text-body text-ink",
                  "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none",
                  "hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  "pointer-coarse:min-h-11",
                  active && "bg-surface-raised font-strong",
                  tabs && "whitespace-nowrap",
                )}
              >
                <span>{item.label}</span>{" "}
                {item.key === "fila" && counts !== undefined && (
                  <NavCount
                    abertos={counts.fila_abertos}
                    vencidos={counts.fila_vencidos}
                    active={active}
                  />
                )}
                {item.key === "monitor" && counts !== undefined && (
                  <MonitorCount
                    alertas={counts.alertas_criticos_abertos}
                    active={active}
                  />
                )}
                {/* S5 "batch running": text, not a spinner, in the link's name. */}
                {item.key === "lote" && loteRunning && (
                  <span className="text-secondary text-ink-muted">
                    {shellCopy["nav.lote.running"]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
