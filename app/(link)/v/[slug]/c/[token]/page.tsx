import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { caseAnnouncement } from "@/features/seller-link/case-announcement";
import { CaseContent } from "@/features/seller-link/components/case/case-content";
import { CaseViewTransition } from "@/features/seller-link/components/case/case-view-transition";
import { StepIndicator } from "@/features/seller-link/components/step-indicator";
import { deriveCaseView } from "@/features/seller-link/case-view";
import { formCopy } from "@/features/seller-link/copy/form";
import { caseParamsSchema } from "@/features/seller-link/route-params";
import { getPublicCase, getPublicLink } from "@/lib/api/public-link";

// The page title reuses form.h1 (plan § 1.6). noindex comes from (link)/layout.tsx.
export const metadata: Metadata = { title: formCopy["form.h1"] };

type Props = {
  params: Promise<{ slug: string; token: string }>;
};

export default async function CasePage({
  params,
}: Props): Promise<JSX.Element> {
  const parsed = caseParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const { slug, token } = parsed.data;
  const [link, caseResult] = await Promise.all([
    getPublicLink(slug),
    getPublicCase(slug, token),
  ]);
  if (!link.ok || !caseResult.ok) notFound();

  const view = deriveCaseView(caseResult.publicCase, Date.now());
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator step={view.step} />
      <CaseViewTransition
        viewKey={view.viewKey}
        announcement={caseAnnouncement(view.viewKey, caseResult.publicCase)}
      >
        <CaseContent
          slug={slug}
          token={token}
          view={view}
          publicCase={caseResult.publicCase}
          link={link.link}
        />
      </CaseViewTransition>
    </div>
  );
}
