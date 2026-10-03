"use client";

import { useRouter } from "next/navigation";
import { startTransition, type JSX } from "react";

import { CaseError } from "@/features/seller-link/components/case/case-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// The case failed to load (an unexpected API failure). The digest is never
// shown. Retry re-renders the page on the server, then resets the boundary.
export default function CaseLoadError({ reset }: Props): JSX.Element {
  const router = useRouter();
  return (
    <CaseError
      onRetry={() => {
        startTransition(() => {
          router.refresh();
          reset();
        });
      }}
    />
  );
}
