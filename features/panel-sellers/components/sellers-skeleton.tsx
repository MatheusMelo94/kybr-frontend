import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** The table's loading state (S10): the card and its rows, static. */
export function SellersSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
