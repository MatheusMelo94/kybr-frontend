import type { CSSProperties, JSX } from "react";

import { CardError } from "@/features/panel-home/components/card-error";
import {
  cardHeadingId,
  HomeCard,
} from "@/features/panel-home/components/home-card";
import { homeCopy } from "@/features/panel-home/copy";
import { weekRows, type WeekRow } from "@/features/panel-home/home-state";
import { formatNumber } from "@/features/panel-shell/format";
import type { Dashboard } from "@/lib/api/schemas/panel/home";

const WEEK_ID = "home-week";

type Props = { semana: Dashboard["semana"] };

/**
 * "Semana" (S9, AC 54, plan-m8 D3): seven static CSS bars, each a track
 * with a bar scaled by --v (0 leaves the empty track), aria-hidden; a
 * screen reader reads the visually hidden table instead (spec §
 * Accessibility Acceptance › Charts). No motion, no chart library.
 * home.card.error when the series is missing (PH3).
 */
export function WeekCard({ semana }: Props): JSX.Element {
  return (
    <HomeCard
      id={WEEK_ID}
      title={homeCopy["home.week.h"]}
      sub={homeCopy["home.week.sub"]}
    >
      {semana === undefined ? (
        <CardError describedBy={cardHeadingId(WEEK_ID)} />
      ) : (
        <WeekChart rows={weekRows(semana)} />
      )}
    </HomeCard>
  );
}

function WeekChart({ rows }: { rows: WeekRow[] }): JSX.Element {
  return (
    <>
      <div data-week-bars aria-hidden="true" className="flex h-24 gap-2">
        {rows.map((row) => (
          <div
            key={row.dia}
            className="h-full min-w-0 flex-1 rounded-sm bg-line-soft"
          >
            <div
              data-week-bar
              className="h-full origin-bottom rounded-sm bg-ink-muted"
              style={
                {
                  "--v": String(row.ratio),
                  transform: "scaleY(var(--v))",
                } as CSSProperties
              }
            />
          </div>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{homeCopy["home.week.sub"]}</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dia}>
                <th scope="row">{row.weekday}</th>
                <td className="tabular-nums">{formatNumber(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
