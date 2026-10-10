import type { JSX } from "react";

import { alertasCopy } from "@/features/panel-alertas/copy";
import { fill } from "@/features/panel-shell/format";

/**
 * "Onde avisamos" (AC 50, MVP): the login e-mail from /me and mon.freq,
 * read-only. The P3 settings come later.
 */
export function EmailCard({ email }: { email: string }): JSX.Element {
  return (
    <section
      aria-labelledby="mon-email-h"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-4"
    >
      <h2 id="mon-email-h" className="text-h2 font-title text-ink">
        {alertasCopy["mon.email.h"]}
      </h2>
      <p className="text-body break-words text-ink">
        {fill(alertasCopy["mon.email.body"], { email })}
      </p>
      <p className="text-secondary text-ink-muted">{alertasCopy["mon.freq"]}</p>
    </section>
  );
}
