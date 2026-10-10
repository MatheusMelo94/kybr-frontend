import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";

type Props = {
  id: string;
  title: string;
  sub?: string;
  cta?: { href: string; label: string };
  children: ReactNode;
};

/** An Início card: a region named by its h2, an optional line under it, its content and one link. */
/** The card's h2 id (P8-006: its CardError retry is described by it). */
export const cardHeadingId = (id: string): string => `${id}-h`;

export function HomeCard({
  id,
  title,
  sub,
  cta,
  children,
}: Props): JSX.Element {
  const headingId = cardHeadingId(id);
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-body font-strong text-ink">
          {title}
        </h2>
        {sub !== undefined && (
          <p className="text-secondary text-ink-muted">{sub}</p>
        )}
      </div>
      {children}
      {cta !== undefined && (
        <div className="flex flex-wrap">
          <Link href={cta.href} className={PANEL_LINK}>
            {cta.label}
          </Link>
        </div>
      )}
    </section>
  );
}
