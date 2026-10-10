import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** The case detail's shape while it loads: header, checks, seller (static). */
export function DetailSkeleton(): JSX.Element {
  return (
    <div data-testid="fila-detail-skeleton" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
