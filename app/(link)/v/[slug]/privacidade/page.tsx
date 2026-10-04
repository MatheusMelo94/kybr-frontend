import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { PrivacyNotice } from "@/features/seller-link/components/privacy-notice";
import { privacyCopy } from "@/features/seller-link/copy/privacy";
import { slugParamsSchema } from "@/features/seller-link/route-params";
import { getPublicLink, type PublicLinkResult } from "@/lib/api/public-link";

// noindex comes from (link)/layout.tsx.
export const metadata: Metadata = { title: privacyCopy["privacy.h1"] };

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * The privacy notice (spec § Privacy notice, AC 31). Its text is static, so a
 * link-info failure is a partial state (the .fallback strings, no contact),
 * never the error boundary; an unknown or disabled link is Link not found.
 */
export default async function PrivacyPage({
  params,
}: Props): Promise<JSX.Element> {
  const parsed = slugParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const { slug } = parsed.data;
  let link: PublicLinkResult | null;
  try {
    link = await getPublicLink(slug);
  } catch {
    link = null; // getPublicLink logged it
  }
  if (link !== null && !link.ok) notFound();

  return <PrivacyNotice slug={slug} link={link?.link ?? null} />;
}
