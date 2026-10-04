import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";
import { formCopy } from "@/features/seller-link/copy/form";
import { getPublicLink } from "@/lib/api/public-link";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

// /v/{slug}/c with no token (QA-M3-002). On a dead link (unknown or disabled
// slug) the screen is Link not found, like the form and the case routes:
// notFound() thrown from this layout renders the slug's not-found.tsx, a
// boundary the page itself can't reach. The same cached D1 as the form, so no
// new existence oracle. If D1 can't be read, the page's Case not found stands
// ("Começar de novo" leads to the form, which shows its own load error).
/** The link, or undefined when D1 can't be read (cached: the page reads it once). */
async function linkFor(slug: string) {
  return getPublicLink(slug).catch(() => undefined);
}

/** The screen's title: Link not found on a dead link, else Case not found. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await linkFor((await params).slug);
  return {
    title:
      link !== undefined && !link.ok
        ? formCopy["notfound.h1"]
        : caseCopy["casenotfound.h1"],
  };
}

export default async function CaseIndexLayout({
  children,
  params,
}: Props): Promise<JSX.Element> {
  const { slug } = await params;
  const link = await linkFor(slug);
  if (link !== undefined && !link.ok) notFound();
  return <>{children}</>;
}
