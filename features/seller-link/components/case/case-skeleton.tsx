import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The case page's loading state on a reload or reopen: the result layout's
 * step indicator, title and three rows (spec § States Matrix, case page;
 * design § Screen States Matrix). Static, never animated.
 */
export function CaseSkeleton(): JSX.Element {
  return (
    <div
      aria-busy="true"
      data-testid="case-skeleton"
      className="flex flex-col gap-6"
    >
      <div data-skeleton="steps">
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div data-skeleton="title">
        <Skeleton className="h-9 w-3/4" />
      </div>
      <div data-skeleton="row">
        <Skeleton className="h-14 w-full" />
      </div>
      <div data-skeleton="row">
        <Skeleton className="h-14 w-full" />
      </div>
      <div data-skeleton="row">
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
