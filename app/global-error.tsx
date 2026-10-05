"use client";

import type { JSX } from "react";

import { LinkMain } from "@/features/seller-link/components/link-main";
import { LoadError } from "@/features/seller-link/components/load-error";

import "./(link)/link.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// A failure in the root layout itself. It replaces the whole document, so it
// renders its own <html>. Generic loaderror copy; the digest is never shown.
// No Kybr footer: it stays minimal (brand v1 B9).
export default function GlobalError({ reset }: Props): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <LinkMain>
          <LoadError onRetry={reset} />
        </LinkMain>
      </body>
    </html>
  );
}
