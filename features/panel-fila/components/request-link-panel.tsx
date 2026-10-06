"use client";

import { useEffect, useId, useRef, useState, type JSX } from "react";

import { FormAlert } from "@/components/panel/form-alert";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  caseId: string;
  /** The case's link_vendedor (D-C2), already through parseLinkVendedor (F8). */
  link: string | undefined;
};

/**
 * The no-e-mail link panel (AC 37, D11, O-04): doc.link.h, the link in a
 * read-only input and "Copiar link". It shows whenever the case has
 * link_vendedor, and at once after T108's request (its result's link), when
 * focus moves to the heading. F9: the link is only the input's value; never
 * an href, a title, a label or a toast, and the clipboard is only written,
 * inside the click.
 */
export function RequestLinkPanel({ caseId, link }: Props): JSX.Element | null {
  const { flash } = useFila();
  const { show } = useToast();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const requested = flash[caseId]?.kind === "requested" ? flash[caseId] : null;
  const shown = link ?? requested?.link;
  const fresh = requested !== null && shown !== undefined;

  // After the frame: the dialog that asked closes in this same commit and
  // returns focus to its trigger (and an open modal keeps focus inside).
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [fresh, requested]);

  if (shown === undefined) return null;

  async function copyLink(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // A rejection, or no clipboard API at all: copy by hand.
      setFailed(true);
      input.current?.focus();
      input.current?.select();
      return;
    }
    setFailed(false);
    show(globalCopy["toast.link_copied"]);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg border border-field-line p-4"
    >
      <h3
        ref={heading}
        id={headingId}
        tabIndex={-1}
        className="text-body font-strong text-ink"
      >
        {filaCopy["doc.link.h"]}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="text"
          readOnly
          value={shown}
          aria-labelledby={headingId}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-lg border border-field-line bg-field px-4 py-2 text-secondary text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        <Button
          type="button"
          variant="secondary"
          size="panel"
          onClick={() => void copyLink(shown)}
        >
          {filaCopy["doc.link.copy"]}
        </Button>
      </div>
      <FormAlert>{failed && globalCopy["copy.error"]}</FormAlert>
    </section>
  );
}
