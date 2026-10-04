import type { JSX } from "react";

import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { sharedCopy } from "@/features/seller-link/copy/shared";
import { fill } from "@/features/seller-link/format";
import { cn } from "@/lib/utils";

type Props = {
  step: 1 | 2 | 3;
};

const SEGMENTS = [1, 2, 3] as const;

/**
 * The three-step bar, the link's only wayfinding. Screen readers get "Passo n
 * de 3" as text, and the segments are aria-hidden. The unfilled segments use
 * field-line, so the count stays visible at 3:1 (WCAG 1.4.11). On a step
 * change the current segment fills in from the left (transform only); under
 * reduced motion it's instant. Only a change: it fills in under a
 * [data-changed] ancestor, which CaseViewTransition sets once the view
 * changes, so no first paint animates (spec § Motion Intent; review 0022).
 */
export function StepIndicator({ step }: Props): JSX.Element {
  return (
    <div>
      <VisuallyHidden>
        {fill(sharedCopy["step.sr"], { n: step })}
      </VisuallyHidden>
      <div className="flex gap-1.5">
        {SEGMENTS.map((segment) => (
          <span
            // Keyed by its state too, so a segment that becomes the current
            // one mounts afresh and @starting-style fills it in (T33).
            key={`${segment}-${segment === step}`}
            aria-hidden="true"
            data-segment={segment <= step ? "filled" : "empty"}
            className={cn(
              "h-1 flex-1 rounded-full",
              segment <= step ? "bg-accent" : "bg-field-line",
              segment === step &&
                "origin-left transition-transform duration-(--duration-base) ease-out-quart motion-reduce:transition-none in-data-changed:starting:scale-x-0",
            )}
          />
        ))}
      </div>
    </div>
  );
}
