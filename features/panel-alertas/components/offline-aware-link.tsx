"use client";

import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { globalCopy } from "@/features/panel-shell/copy/global";
import { useOnline } from "@/lib/use-online";

/** The one visible offline.actions every disabled link points at (QA Q5). */
export const MON_OFFLINE_ACTIONS_ID = "mon-offline-actions";

type Props = {
  href: string;
  className: string;
  /** The resolved link copy: never an alert object (Security A-F1). */
  children: ReactNode;
  /** The first link on the page carries the visible offline.actions (G6). */
  note?: boolean;
  /** An element id that tells same-named links apart (P7-002): an id only. */
  describedBy?: string;
};

/**
 * A link that goes nowhere offline (G6, AC 51): a full load offline would
 * be the browser's error page, so it's aria-disabled, its click does
 * nothing, and it's described by offline.actions. Online it's a plain link
 * (no prefetch: the target is per request).
 */
export function OfflineAwareLink({
  href,
  className,
  children,
  note = false,
  describedBy,
}: Props): JSX.Element {
  const offline = !useOnline();
  const description =
    [describedBy, offline ? MON_OFFLINE_ACTIONS_ID : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <>
      <Link
        href={href}
        prefetch={false}
        className={className}
        aria-disabled={offline || undefined}
        aria-describedby={description}
        onClick={(event) => {
          if (offline) event.preventDefault();
        }}
      >
        {children}
      </Link>
      {offline && note && (
        <p
          id={MON_OFFLINE_ACTIONS_ID}
          className="basis-full text-secondary text-ink-muted"
        >
          {globalCopy["offline.actions"]}
        </p>
      )}
    </>
  );
}
