import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** The Fila stub's shape while it loads (a static block, no spinner). */
export function FilaSkeleton(): JSX.Element {
  return (
    <div data-testid="fila-skeleton" className="flex flex-col gap-2">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-6 w-full max-w-prose" />
    </div>
  );
}
