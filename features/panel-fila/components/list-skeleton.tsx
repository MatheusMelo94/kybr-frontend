import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The list's height per item (CaseOption keeps it: no shift when it lands). */
export const LIST_ITEM_HEIGHT = "h-19";

/** Five static items while the list loads (spec S6: no shimmer). */
export function ListSkeleton(): JSX.Element {
  return (
    <div data-testid="fila-list-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} data-skeleton-item>
          <Skeleton className={cn(LIST_ITEM_HEIGHT, "w-full")} />
        </div>
      ))}
    </div>
  );
}
