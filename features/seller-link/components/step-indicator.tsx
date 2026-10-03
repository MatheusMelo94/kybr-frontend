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
 * field-line, so the count stays visible at 3:1 (WCAG 1.4.11).
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
            key={segment}
            aria-hidden="true"
            data-segment={segment <= step ? "filled" : "empty"}
            className={cn(
              "h-1 flex-1 rounded-full",
              segment <= step ? "bg-accent" : "bg-field-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}
