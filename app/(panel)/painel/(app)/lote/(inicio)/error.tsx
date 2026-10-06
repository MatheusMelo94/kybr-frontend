"use client";

import type { JSX } from "react";

import { LoadError } from "@/features/panel-shell/components/load-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// error.load.* with a retry; the digest is never shown (FA § Error Handling).
export default function LoteError({ reset }: Props): JSX.Element {
  return <LoadError reset={reset} />;
}
