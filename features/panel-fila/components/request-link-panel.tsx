"use client";

import { useEffect, useRef, type JSX } from "react";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { SectionHeading } from "@/features/panel-fila/components/section-heading";
import { filaCopy } from "@/features/panel-fila/copy";

type Props = {
  caseId: string;
  /** The case's link_vendedor (D-C2), already through parseLinkVendedor (F8). */
  link: string | undefined;
  /** A decided case shows no link panel, whatever the API sends (AC 41, P6-009). */
  decided: boolean;
};

/**
 * The no-e-mail link panel (AC 37, D11, O-04): doc.link.h, the link in a
 * read-only input and "Copiar link". It shows whenever the case has
 * link_vendedor, and at once after T108's request (its result's link), when
 * focus moves to the heading. F9: the link is only the input's value; never
 * an href, a title, a label or a toast, and the clipboard is only written,
 * inside the click.
 */
export function RequestLinkPanel({
  caseId,
  link,
  decided,
}: Props): JSX.Element | null {
  const { flash } = useFila();
  const panel = useRef<HTMLElement>(null);
  const requested = flash[caseId]?.kind === "requested" ? flash[caseId] : null;
  const shown = link ?? requested?.link;
  const fresh = requested !== null && shown !== undefined;

  // After the frame: the dialog that asked closes in this same commit and
  // returns focus to its trigger (and an open modal keeps focus inside).
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => {
      // An h2 below lg and an h3 at lg (P6-002): focus the one displayed.
      const headings = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          "[data-section-heading]",
        ) ?? []),
      ];
      (
        headings.find((heading) => heading.getClientRects().length > 0) ??
        headings[0]
      )?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [fresh, requested]);

  if (shown === undefined || decided) return null;

  return (
    // Named by the copy, not by the heading: two heading elements render
    // (one is display: none), and aria-labelledby would read both.
    <section
      ref={panel}
      aria-label={filaCopy["doc.link.h"]}
      className="flex flex-col gap-2 rounded-lg border border-field-line p-4"
    >
      <SectionHeading focusable>{filaCopy["doc.link.h"]}</SectionHeading>
      <CopyLinkButton
        value={shown}
        label={filaCopy["doc.link.copy"]}
        inputLabel={filaCopy["doc.link.h"]}
        inputVisible="always"
      />
    </section>
  );
}
