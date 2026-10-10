import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** Configurações' shape while /me loads (DC § Screen States Matrix). */
export function SettingsSkeleton(): JSX.Element {
  return (
    <div
      data-testid="settings-skeleton"
      className="flex max-w-prose min-w-0 flex-col gap-8"
    >
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <Skeleton className="h-10 w-44" />
    </div>
  );
}
