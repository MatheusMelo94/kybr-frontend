import type { JSX, ReactNode } from "react";

import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { SafeHttpsUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

type Props = {
  /** Only a URL checked by toSafeHttpsUrl() can be rendered. */
  href: SafeHttpsUrl;
  /** Screen-reader suffix that ends the accessible name, e.g. "(abre em outra aba)". */
  srSuffix: string;
  children: ReactNode;
  className?: string;
};

/** A link that opens an external https: page in a new tab. */
export function ExternalLink({
  href,
  srSuffix,
  children,
  className,
}: Props): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center text-ink underline underline-offset-4",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      {children} <VisuallyHidden>{srSuffix}</VisuallyHidden>
    </a>
  );
}
