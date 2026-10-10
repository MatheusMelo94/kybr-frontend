"use client";

import { useEffect, useRef, type JSX, type ReactNode } from "react";

import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import {
  FILA_NO_CASE,
  useFila,
} from "@/features/panel-fila/components/fila-provider";

type Props = {
  /** The case this page rendered, or null on /fila. */
  caseId: string | null;
  children: ReactNode;
};

/**
 * The detail pane: the skeleton while another case is being opened (the
 * list stays interactive), and the heading ([data-detail-heading]) takes
 * focus when an opened case lands. A deep link moves no focus (AC 41). A
 * case being decided shows the skeleton until the next one lands (D13).
 */
export function DetailPane({ caseId, children }: Props): JSX.Element {
  const { pendingCaseId, focusIntent, settle, removal } = useFila();
  const pane = useRef<HTMLDivElement>(null);
  // /fila (no case) is FILA_NO_CASE: after the last case is decided, its
  // empty state takes the focus.
  const shown = caseId ?? FILA_NO_CASE;
  const pending =
    (pendingCaseId !== null && pendingCaseId !== shown) ||
    (removal !== null && removal.id === caseId);

  useEffect(() => {
    if (pendingCaseId !== null && pendingCaseId === shown) settle("pending");
  }, [pendingCaseId, shown, settle]);

  useEffect(() => {
    // A failed decision restores the case once its skeleton goes (T106, Q6).
    if (pending || focusIntent === null || focusIntent !== shown) return;
    // D9: an h1 below lg and an h2 at lg; focus the one displayed.
    const headings = [
      ...(pane.current?.querySelectorAll<HTMLElement>(
        "[data-detail-heading]",
      ) ?? []),
    ];
    (
      headings.find((heading) => heading.getClientRects().length > 0) ??
      headings[0]
    )?.focus();
    settle("focus");
  }, [pending, focusIntent, shown, settle]);

  return <div ref={pane}>{pending ? <DetailSkeleton /> : children}</div>;
}
