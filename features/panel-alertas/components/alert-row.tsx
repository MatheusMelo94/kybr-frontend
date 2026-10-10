import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { CaseLink } from "@/features/panel-alertas/components/case-link";
import { alertasCopy } from "@/features/panel-alertas/copy";
import { alertSentence } from "@/features/panel-alertas/sentence";
import { formatRelativo } from "@/features/panel-shell/format";
import type { Alert } from "@/lib/api/schemas/panel/alerts";
import type { AlertSeveridade } from "@/lib/panel-api-values";

// DDR-0003: the signal is the dot; the word says it (AC 71).
const TONES: Record<AlertSeveridade, StatusTone> = {
  critico: "danger",
  atencao: "warning",
  info: "neutral",
};

type Props = {
  alert: Alert;
  now: Date;
  /** The page's first open case: its link carries offline.actions (G6). */
  firstOpen?: boolean;
};

/**
 * One alert (S8): severity, the alert.<TIPO> sentence (the article's name),
 * when, alert.pedido_aberto, and the case action. Below lg the parts stack
 * in that order (AC 51).
 */
export function AlertRow({
  alert,
  now,
  firstOpen = false,
}: Props): JSX.Element {
  const sentenceId = `alerta-${alert.id}`;
  return (
    <article
      aria-labelledby={sentenceId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-secondary font-strong text-ink">
          <StatusDot tone={TONES[alert.severidade]} />
          <span>{alertasCopy[`alert.sev.${alert.severidade}`]}</span>
        </p>
        <p id={sentenceId} className="text-body break-words text-ink">
          {alertSentence(alert)}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-secondary text-ink-muted tabular-nums">
          <time dateTime={alert.detectado_em}>
            {formatRelativo(alert.detectado_em, now)}
          </time>
          {alert.pedido_aberto === true && (
            <span>{alertasCopy["alert.pedido_aberto"]}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-56">
        <CaseLink alert={alert} note={firstOpen} />
      </div>
    </article>
  );
}
