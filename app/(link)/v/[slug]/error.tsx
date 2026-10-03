"use client";

import { useRouter } from "next/navigation";
import { startTransition, type JSX } from "react";

import { LoadError } from "@/features/seller-link/components/load-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// The link info failed to load (an unexpected API failure). The digest is
// never shown. Retry re-renders the page on the server, then resets the
// boundary.
export default function FormError({ reset }: Props): JSX.Element {
  const router = useRouter();
  return (
    <LoadError
      onRetry={() => {
        startTransition(() => {
          router.refresh();
          reset();
        });
      }}
    />
  );
}
