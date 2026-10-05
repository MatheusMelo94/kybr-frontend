import type { Metadata } from "next";
import type { JSX } from "react";

import { CostCard } from "@/features/panel-lote/components/cost-card";
import { HistoryList } from "@/features/panel-lote/components/history-list";
import { OnboardingStep2Banner } from "@/features/panel-lote/components/onboarding-step2-banner";
import { WhyCard } from "@/features/panel-lote/components/why-card";
import { loteCopy } from "@/features/panel-lote/copy";
import { historyOrError } from "@/features/panel-lote/data";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: loteCopy["lote.h1"] };

// S7 Verificar em lote: the empty state, the cost and the history. Two
// columns at lg (≈ 1.5 : 1), one below (main first, then the side cards).
type Props = { searchParams: Promise<{ inicio?: string | string[] }> };

export default async function LotePage({
  searchParams,
}: Props): Promise<JSX.Element> {
  const me = await requireSession();
  // Onboarding step 2 (J1.5): only with ?inicio=1; no state behind it.
  const onboarding = (await searchParams).inicio === "1";
  const history = await historyOrError();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">
          {loteCopy["lote.h1"]}
        </h1>
        <p className="text-lead font-lead text-ink-muted">
          {loteCopy["lote.lead"]}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {onboarding && <OnboardingStep2Banner />}
          <HistoryList history={history} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <CostCard plano={me.workspace.plano} />
          <WhyCard />
        </div>
      </div>
    </div>
  );
}
