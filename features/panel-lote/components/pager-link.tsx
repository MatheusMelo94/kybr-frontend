"use client";

import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { useSoftNavigate } from "@/features/panel-lote/soft-navigate";

type Props = { href: string; className: string; children: ReactNode };

/**
 * A pager link (T83): a real link (middle click, no JS), whose plain click
 * goes through useSoftNavigate (the soft navigation with its fallback).
 */
export function PagerLink({ href, className, children }: Props): JSX.Element {
  const navigate = useSoftNavigate();
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
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
