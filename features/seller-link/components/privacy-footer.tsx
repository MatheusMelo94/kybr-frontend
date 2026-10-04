import Link from "next/link";
import type { JSX } from "react";

import { sharedCopy } from "@/features/seller-link/copy/shared";

type Props = {
  slug: string;
};

/** privacy.line plus the link to this link's privacy notice, in the same tab (plan § 1.4). */
export function PrivacyFooter({ slug }: Props): JSX.Element {
  return (
    <footer className="flex flex-col gap-1 text-secondary text-ink-muted">
      <p>{sharedCopy["privacy.line"]}</p>
      <Link
        href={`/v/${slug}/privacidade`}
        className="inline-flex min-h-11 items-center self-start text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {sharedCopy["privacy.link"]}
      </Link>
    </footer>
  );
}
