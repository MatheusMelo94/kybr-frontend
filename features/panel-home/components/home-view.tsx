import Link from "next/link";
import type { JSX } from "react";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { CardError } from "@/features/panel-home/components/card-error";
import { FeedCard } from "@/features/panel-home/components/feed-card";
import { FirstSteps } from "@/features/panel-home/components/first-steps";
import { Greeting } from "@/features/panel-home/components/greeting";
import { Kpis } from "@/features/panel-home/components/kpis";
import { QueueCard } from "@/features/panel-home/components/queue-card";
import { WeekCard } from "@/features/panel-home/components/week-card";
import { homeCopy } from "@/features/panel-home/copy";
import {
  pickHomeState,
  showFirstSteps,
  summaryKey,
} from "@/features/panel-home/home-state";
import { settingsCopy } from "@/features/panel-settings/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill } from "@/features/panel-shell/format";
import type { Dashboard } from "@/lib/api/schemas/panel/home";
import type { Me } from "@/lib/api/schemas/panel/me";

type Props = {
  me: Me;
  /** D-H1, masked in the data layer (O-F4). */
  dashboard: Dashboard;
  now: Date;
};

/**
 * Início (S9, AC 53/54) from one D-H1 read: the greeting and summary, the
 * two actions, then the KPIs and the cards. A new workspace (nothing
 * verified) shows home.summary.none and hides the KPIs, queue and feed.
 * Each missing card fails alone (plan-m8 D2). Primeiros passos (AC 53)
 * leads for a new workspace and follows the cards otherwise.
 */
export function HomeView({ me, dashboard, now }: Props): JSX.Element {
  const state = pickHomeState(dashboard);
  const steps = showFirstSteps(dashboard.primeiros_passos) ? (
    <FirstSteps steps={dashboard.primeiros_passos} />
  ) : null;
  const contagens = me.workspace.contagens;
  const summary =
    state === "new"
      ? homeCopy["home.summary.none"]
      : contagens &&
        fill(
          homeCopy[
            summaryKey(
              contagens.fila_abertos,
              contagens.alertas_criticos_abertos,
            )
          ],
          {
            n: contagens.fila_abertos,
            m: contagens.alertas_criticos_abertos,
          },
        );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Greeting nome={me.nome} now={now} />
          {summary !== undefined && (
            <p className="text-lead font-lead text-ink-muted tabular-nums">
              {summary}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <CopyLinkButton
            value={me.workspace.link_url}
            label={homeCopy["home.cta.copy"]}
            inputLabel={settingsCopy["settings.link.h"]}
            inputVisible="on-error"
          />
          <Link href="/lote" className={PANEL_LINK}>
            {homeCopy["home.cta.lote"]}
          </Link>
        </div>
      </div>
      {state === "new" && steps}
      {state === "ready" && (
        <>
          {dashboard.kpis ? <Kpis kpis={dashboard.kpis} /> : <CardError />}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <QueueCard fila={dashboard.fila} />
            <FeedCard alertas={dashboard.alertas} />
          </div>
          <WeekCard semana={dashboard.semana} />
          {steps}
        </>
      )}
    </div>
  );
}
