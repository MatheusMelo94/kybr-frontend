import type { Metadata } from "next";
import type { JSX } from "react";

import { EmailCard } from "@/features/panel-alertas/components/email-card";
import { MonHeader } from "@/features/panel-alertas/components/mon-header";
import { MonLayout } from "@/features/panel-alertas/components/mon-layout";
import { alertasCopy } from "@/features/panel-alertas/copy";
import { loadMonitoramento } from "@/features/panel-alertas/data";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: alertasCopy["mon.h1"] };

// /monitoramento (S8 MVP): read-only. /me is the layout's read (React
// cache(), one request); D-M1 and D-M2 load in parallel.
export default async function MonitoramentoPage(): Promise<JSX.Element> {
  const me = await requireSession();
  const { monitoring } = await loadMonitoramento();
  return (
    <MonLayout
      header={<MonHeader monitoring={monitoring} />}
      main={
        <section aria-labelledby="mon-alerts-h" className="flex flex-col gap-2">
          <h2 id="mon-alerts-h" className="text-h2 font-title text-ink">
            {alertasCopy["mon.alerts.h"]}
          </h2>
          <p className="text-body text-ink-muted">
            {alertasCopy["mon.alerts.sub"]}
          </p>
        </section>
      }
      aside={<EmailCard email={me.email} />}
    />
  );
}
