import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** loading.tsx (S9): the header line, 4 KPIs and 3 cards, static (CLS 0, no pulse). */
export function HomeSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-6 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} data-skeleton-kpi>
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} data-skeleton-card>
            <Skeleton className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
