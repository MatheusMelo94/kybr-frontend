import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const SECTIONS = 5;

/**
 * The privacy notice's loading state: the headings and paragraphs as static
 * boxes (spec § Privacy notice, Loading; design § Screen States Matrix).
 */
export function PrivacySkeleton(): JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-9 w-3/4" />
      {Array.from({ length: SECTIONS }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
