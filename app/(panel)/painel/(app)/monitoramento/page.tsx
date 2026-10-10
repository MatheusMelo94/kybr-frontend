import type { Metadata } from "next";
import type { JSX } from "react";

import { AlertList } from "@/features/panel-alertas/components/alert-list";
import { MonEmpty } from "@/features/panel-alertas/components/mon-empty";
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
  const { alerts, monitoring, state } = await loadMonitoramento();
  return (
    <MonLayout
      header={<MonHeader monitoring={monitoring} />}
      main={
        <AlertList
          alerts={alerts}
          now={new Date()}
          empty={state.kind === "success" ? null : <MonEmpty state={state} />}
        />
      }
      aside={<EmailCard email={me.email} />}
    />
  );
}
