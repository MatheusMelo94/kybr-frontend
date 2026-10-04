import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { OnboardingForm } from "@/features/panel-onboarding/components/onboarding-form";
import { onboardingCopy } from "@/features/panel-onboarding/copy";
import { fill } from "@/features/panel-shell/format";
import { getCategories } from "@/lib/api/panel/workspace";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: onboardingCopy["onb.h1"] };

// S4 Começar (AC 4, step 1 of 2). Done already → home; the contact is
// edited in Configurações (M8).
export default async function ComecarPage(): Promise<JSX.Element> {
  const me = await requireSession();
  if (me.workspace.onboarding_concluido) redirect("/");
  const categories = await getCategories();

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-secondary text-ink-muted">
          {fill(onboardingCopy["onb.step"], { n: 1 })}
        </p>
        <h1 className="text-title font-title text-ink">
          {onboardingCopy["onb.h1"]}
        </h1>
        <p className="text-body font-lead text-ink-muted">
          {onboardingCopy["onb.lead"]}
        </p>
      </div>
      <OnboardingForm categories={categories} />
    </>
  );
}
