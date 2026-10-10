import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** Regras' loading state (spec S11): the rule rows and the documents card, static. */
export function RegrasSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-1/2" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 border-t border-line pt-4"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-6 w-1/2" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
