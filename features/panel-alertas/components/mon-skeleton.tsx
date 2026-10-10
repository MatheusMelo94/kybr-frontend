import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MonLayout } from "@/features/panel-alertas/components/mon-layout";

/** loading.tsx: the pill, five rows and the side card, static (CLS 0, no pulse). */
export function MonSkeleton(): JSX.Element {
  return (
    <MonLayout
      header={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-6 w-full max-w-xl" />
          <div data-skeleton-pill>
            <Skeleton className="h-7 w-72 max-w-full rounded-full" />
          </div>
        </div>
      }
      main={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} data-skeleton-row>
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      }
      aside={
        <div data-skeleton-card>
          <Skeleton className="h-40 w-full" />
        </div>
      }
    />
  );
}
