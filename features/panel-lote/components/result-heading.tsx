"use client";

import { useEffect, useRef, useState, type JSX } from "react";

import { LiveRegion } from "@/components/ui/live-region";
import { useBatchFocus } from "@/features/panel-lote/components/batch-focus-keeper";
import { loteCopy } from "@/features/panel-lote/copy";

type Props = {
  /** lote.result.summary, filled. */
  summary: string;
};

/**
 * The result's heading (AC 20; plan M5 accessibility mechanics): when the
 * batch ended while Renata watched, the summary is announced, and focus moves
 * here only if it was in the progress region. A cold load does neither.
 */
export function ResultHeading({ summary }: Props): JSX.Element {
  const focus = useBatchFocus();
  const heading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!focus.endedLive()) return;
    setAnnouncement(summary);
    if (focus.wasInProgress()) heading.current?.focus();
    // Once, when the result replaces the progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h2
        id="lote-result-h"
        ref={heading}
        tabIndex={-1}
        className="text-h2 font-title text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {loteCopy["lote.result.h"]}
      </h2>
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
    </>
  );
}
