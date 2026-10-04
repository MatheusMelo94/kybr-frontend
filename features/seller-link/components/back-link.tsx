"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JSX, MouseEvent } from "react";

import { privacyCopy } from "@/features/seller-link/copy/privacy";

type Props = {
  /** Where to go when there's no page of this site to go back to: the link's form. */
  href: string;
};

/** The path of the page this document was loaded for (not of in-app navigations). */
function loadedPath(): string | undefined {
  const [entry] = performance.getEntriesByType("navigation");
  return entry === undefined ? undefined : new URL(entry.name).pathname;
}

/**
 * True when the seller reached this page from another page of this site:
 * through an in-app navigation (the document was loaded for another path; the
 * referrer still names that first load), or a full load whose referrer is
 * this origin.
 */
function cameFromThisSite(): boolean {
  if (window.history.length < 2) return false;
  const loaded = loadedPath();
  if (loaded !== undefined && loaded !== window.location.pathname) return true;
  if (document.referrer === "") return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * "Voltar ao cadastro" (spec AC 31): back to the page the seller came from
 * (the form or the case page, with its state), or to the link's form when he
 * arrived from elsewhere. A plain link underneath, so it works before
 * hydration too.
 */
export function BackLink({ href }: Props): JSX.Element {
  const router = useRouter();

  function back(event: MouseEvent<HTMLAnchorElement>): void {
    if (!cameFromThisSite()) return;
    event.preventDefault();
    router.back();
  }

  return (
    <Link
      href={href}
      onClick={back}
      className="inline-flex min-h-11 items-center self-start text-body text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {privacyCopy["privacy.back"]}
    </Link>
  );
}
