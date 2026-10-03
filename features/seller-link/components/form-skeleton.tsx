import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The form's loading state: the final layout's boxes at the same heights, so
 * nothing shifts when the link info arrives (spec AC 2; design § Screen
 * States Matrix). Static, never animated.
 */
export function FormSkeleton(): JSX.Element {
  return (
    <div
      aria-busy="true"
      data-testid="form-skeleton"
      className="flex flex-col gap-6"
    >
      <div data-skeleton="name">
        <Skeleton className="h-5 w-32" />
      </div>
      <div data-skeleton="steps">
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div data-skeleton="title">
        <Skeleton className="h-9 w-3/4" />
      </div>
      <div data-skeleton="lead" className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div data-skeleton="fields" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
      <div data-skeleton="button">
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}
