"use client";

import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

type Props = {
  href: string;
  className: string;
  children: ReactNode;
  id?: string | undefined;
  "aria-current"?: "page" | undefined;
};

/**
 * An in-page link (Lote's pager, T83; the Fila's tabs and "Carregar mais",
 * T98): a real link (middle click, no JS), whose plain click goes through
 * useSoftNavigate (the soft navigation with its fallback, P5-004). No
 * prefetch: the target is per request.
 */
export function SoftLink({
  href,
  className,
  children,
  id,
  "aria-current": ariaCurrent,
}: Props): JSX.Element {
  const navigate = useSoftNavigate();
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      id={id}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </Link>
  );
}
