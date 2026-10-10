import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { alertasCopy } from "@/features/panel-alertas/copy";
import { alertSentence } from "@/features/panel-alertas/sentence";
import { CardError } from "@/features/panel-home/components/card-error";
import {
  cardHeadingId,
  HomeCard,
} from "@/features/panel-home/components/home-card";
import { homeCopy } from "@/features/panel-home/copy";
import type { Dashboard } from "@/lib/api/schemas/panel/home";
import type { AlertSeveridade } from "@/lib/panel-api-values";

const FEED_ID = "home-feed";

// DDR-0003: the signal is the dot; the word says it (AC 71).
const TONES: Record<AlertSeveridade, StatusTone> = {
  critico: "danger",
  atencao: "warning",
  info: "neutral",
};

type Props = { alertas: Dashboard["alertas"] };

/**
 * "Mudanças na base" (S9): the four newest alerts as M7's alert.* sentences,
 * with the severity word; home.feed.empty when none; home.card.error when
 * the field is missing (PH3).
 */
export function FeedCard({ alertas }: Props): JSX.Element {
  return (
    <HomeCard
      id={FEED_ID}
      title={homeCopy["home.feed.h"]}
      cta={{ href: "/monitoramento", label: homeCopy["home.feed.cta"] }}
    >
      {alertas === undefined ? (
        <CardError describedBy={cardHeadingId(FEED_ID)} />
      ) : alertas.length === 0 ? (
        <p className="text-body text-ink">{homeCopy["home.feed.empty"]}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alertas.map((alert) => (
            <li key={alert.id} className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-secondary font-strong text-ink">
                <StatusDot tone={TONES[alert.severidade]} />
                <span>{alertasCopy[`alert.sev.${alert.severidade}`]}</span>
              </p>
              <p className="text-body break-words text-ink">
                {alertSentence(alert)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
