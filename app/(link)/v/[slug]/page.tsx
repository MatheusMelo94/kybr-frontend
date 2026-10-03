import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { MarketplaceName } from "@/features/seller-link/components/marketplace-name";
import { PrivacyFooter } from "@/features/seller-link/components/privacy-footer";
import { StepIndicator } from "@/features/seller-link/components/step-indicator";
import { VerificationForm } from "@/features/seller-link/components/verification-form";
import { formCopy } from "@/features/seller-link/copy/form";
import { slugParamsSchema } from "@/features/seller-link/route-params";
import { passthroughSchema } from "@/features/seller-link/schemas";
import { getPublicLink } from "@/lib/api/public-link";

// The page title reuses form.h1 (plan § 1.6). noindex comes from (link)/layout.tsx.
export const metadata: Metadata = { title: formCopy["form.h1"] };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FormPage({
  params,
  searchParams,
}: Props): Promise<JSX.Element> {
  const parsed = slugParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const { slug } = parsed.data;
  const link = await getPublicLink(slug);
  if (!link.ok) notFound();

  return (
    <div className="flex flex-col gap-6">
      <MarketplaceName nome={link.link.nome} />
      <StepIndicator step={1} />
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-title">{formCopy["form.h1"]}</h1>
        <p className="text-body font-lead text-ink-muted">
          {formCopy["form.lead"]}
        </p>
      </div>
      <VerificationForm
        slug={slug}
        passthrough={passthroughSchema.parse(await searchParams)}
      />
      <PrivacyFooter slug={slug} />
    </div>
  );
}
