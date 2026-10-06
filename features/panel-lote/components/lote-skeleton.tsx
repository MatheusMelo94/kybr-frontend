import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** S7 loading: the drop zone card and the side card, static (no shimmer). */
export function LoteSkeleton(): JSX.Element {
  return (
    <div data-testid="lote-skeleton" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-full max-w-prose" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
