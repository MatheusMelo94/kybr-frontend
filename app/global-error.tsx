"use client";

import type { JSX } from "react";

import { LinkColumn } from "@/features/seller-link/components/link-column";
import { LoadError } from "@/features/seller-link/components/load-error";

import "./globals.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// A failure in the root layout itself. It replaces the whole document, so it
// renders its own <html>. Generic loaderror copy; the digest is never shown.
export default function GlobalError({ reset }: Props): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <LinkColumn>
          <LoadError onRetry={reset} />
        </LinkColumn>
      </body>
    </html>
  );
}
