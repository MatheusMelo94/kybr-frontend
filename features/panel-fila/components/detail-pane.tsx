"use client";

import { useEffect, useRef, type JSX, type ReactNode } from "react";

import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { useFila } from "@/features/panel-fila/components/fila-provider";

type Props = {
  /** The case this page rendered, or null on /fila. */
  caseId: string | null;
  children: ReactNode;
};

/**
 * The detail pane: the skeleton while another case is being opened (the
 * list stays interactive), and the heading ([data-detail-heading]) takes
 * focus when an opened case lands. A deep link moves no focus (AC 41).
 */
export function DetailPane({ caseId, children }: Props): JSX.Element {
  const { pendingCaseId, focusIntent, settle } = useFila();
  const pane = useRef<HTMLDivElement>(null);
  const pending = pendingCaseId !== null && pendingCaseId !== caseId;

  useEffect(() => {
    if (pendingCaseId !== null && pendingCaseId === caseId) settle("pending");
  }, [pendingCaseId, caseId, settle]);

  useEffect(() => {
    if (focusIntent === null || focusIntent !== caseId) return;
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
  }, [focusIntent, caseId, settle]);

  return <div ref={pane}>{pending ? <DetailSkeleton /> : children}</div>;
}
