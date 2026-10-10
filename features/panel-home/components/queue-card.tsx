import Link from "next/link";
import type { JSX } from "react";

import { CardError } from "@/features/panel-home/components/card-error";
import { HomeCard } from "@/features/panel-home/components/home-card";
import { homeCopy } from "@/features/panel-home/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import type { Dashboard } from "@/lib/api/schemas/panel/home";

type Props = { fila: Dashboard["fila"] };

/**
 * "Precisa da sua atenção" (S9): the four oldest open cases, each opening
 * /fila/{id}; home.queue.empty when none; home.card.error when the field
 * is missing (PH3). Names and CNPJs come masked from the data layer (O-F4)
 * and render as text.
 */
export function QueueCard({ fila }: Props): JSX.Element {
  return (
    <HomeCard
      id="home-queue"
      title={homeCopy["home.queue.h"]}
      sub={homeCopy["home.queue.sub"]}
      cta={{ href: "/fila", label: homeCopy["home.queue.cta"] }}
    >
      {fila === undefined ? (
        <CardError />
      ) : fila.length === 0 ? (
        <p className="text-body text-ink">{homeCopy["home.queue.empty"]}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fila.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link
                href={`/fila/${item.id}`}
                className={`${PANEL_LINK} break-words`}
              >
                {item.razao_social ?? item.cnpj}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
