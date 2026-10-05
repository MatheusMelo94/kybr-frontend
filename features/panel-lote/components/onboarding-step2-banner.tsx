import Link from "next/link";
import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { onboardingCopy } from "@/features/panel-onboarding/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill } from "@/features/panel-shell/format";
import { PANEL_HOME } from "@/lib/panel-paths";

/**
 * Onboarding step 2 on /lote?inicio=1 (J1.5, AC 4): "Passo 2 de 2", the
 * invitation, and "Fazer depois" to the home. Read in place: no live region.
 */
export function OnboardingStep2Banner(): JSX.Element {
  return (
    <section
      aria-labelledby="lote-onb-h"
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4"
    >
      <p className="text-secondary text-ink-muted">
        {fill(onboardingCopy["onb.step"], { n: 2 })}
      </p>
      <h2 id="lote-onb-h" className="text-h2 font-title text-ink">
        {loteCopy["lote.onb.title"]}
      </h2>
      <p className="text-body text-ink">{loteCopy["lote.onb.body"]}</p>
      <Link href={PANEL_HOME} className={`${PANEL_LINK} self-start`}>
        {loteCopy["lote.onb.skip"]}
      </Link>
    </section>
  );
}
