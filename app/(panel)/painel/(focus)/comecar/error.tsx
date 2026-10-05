"use client";

import type { JSX } from "react";

import { LoadError } from "@/features/panel-shell/components/load-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// The categories failed to load: nothing else on S4 works without them.
// The digest is never shown (FA § Error Handling).
export default function ComecarError({ reset }: Props): JSX.Element {
  return <LoadError reset={reset} />;
}
