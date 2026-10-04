"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

import { NavCount } from "@/features/panel-shell/components/nav-count";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import type { NavItem } from "@/features/panel-shell/nav";
import { cn } from "@/lib/utils";

type Props = {
  items: readonly NavItem[];
  /** The Fila's counts from /me (or the poller); missing hides them (AC 11). */
  contagens: { fila_abertos: number; fila_vencidos: number } | undefined;
};

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** The panel's nav (AC 9): the build's items, the active one marked, the Fila's count. */
export function PanelNav({ items, contagens }: Props): JSX.Element {
  // The external path: the ADR-0008 spike proved usePathname() sees it under the rewrite.
  const pathname = usePathname();

  return (
    <nav aria-label={shellCopy["nav.label"]}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 flex-wrap items-center gap-x-2 rounded-md px-3 py-2 text-body text-ink",
                  "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none",
                  "hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  "pointer-coarse:min-h-11",
                  active && "bg-surface-raised font-strong",
                )}
              >
                <span>{item.label}</span>{" "}
                {item.key === "fila" && contagens !== undefined && (
                  <NavCount
                    abertos={contagens.fila_abertos}
                    vencidos={contagens.fila_vencidos}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
