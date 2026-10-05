import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** The onboarding form's shape while the categories load (DC § Screen States Matrix). */
export function OnboardingSkeleton(): JSX.Element {
  return (
    <div data-testid="onboarding-skeleton" className="flex flex-col gap-6">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-10 w-full rounded-full" />
    </div>
  );
}
