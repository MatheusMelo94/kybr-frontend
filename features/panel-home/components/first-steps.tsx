"use client";

import Link from "next/link";
import { useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import {
  hideFirstStepsAction,
  type HideFirstStepsResult,
} from "@/features/panel-home/actions";
import { HomeCard } from "@/features/panel-home/components/home-card";
import { homeCopy } from "@/features/panel-home/copy";
import type { FirstStepsState } from "@/features/panel-home/home-state";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

type Props = { steps: FirstStepsState };

// plan-m8 G2: where each step is done.
const ITEMS = [
  { key: "lote", href: "/lote", label: homeCopy["home.steps.lote"] },
  {
    key: "link",
    href: "/configuracoes#link",
    label: homeCopy["home.steps.link"],
  },
  {
    key: "monitor",
    href: "/monitoramento",
    label: homeCopy["home.steps.monitor"],
  },
] as const;

/**
 * "Primeiros passos" (S9, AC 53): the three steps from D-H1, a done one
 * marked with a check and home.steps.done for screen readers. "Ocultar"
 * runs D-H2 and the card goes only after ok (not optimistic); a failure
 * shows error.network inline and the card stays.
 */
export function FirstSteps({ steps }: Props): JSX.Element | null {
  const expire = useSessionExpiry();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onHide(): Promise<void> {
    setBusy(true);
    setFailed(false);
    let result: HideFirstStepsResult;
    try {
      result = await hideFirstStepsAction({ oculto: true });
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    setBusy(false);
    if (result.ok) setHidden(true);
    else if (result.code === "SESSAO_EXPIRADA") expire();
    else setFailed(true);
  }

  if (hidden) return null;
  return (
    <HomeCard id="home-steps" title={homeCopy["home.steps.h"]}>
      <ul className="flex flex-col gap-2">
        {ITEMS.map((item) => (
          <li
            key={item.key}
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            {steps[item.key] && (
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 16 16"
                className="size-4 shrink-0 text-ink"
              >
                <path
                  d="M3 8.5l3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <Link href={item.href} className={`${PANEL_LINK} break-words`}>
              {item.label}
            </Link>
            {steps[item.key] && (
              <VisuallyHidden>{homeCopy["home.steps.done"]}</VisuallyHidden>
            )}
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="panel"
          busy={busy}
          onClick={() => void onHide()}
        >
          {homeCopy["home.steps.hide"]}
        </Button>
        {failed && (
          <p role="alert" className="text-secondary text-danger-ink">
            {globalCopy["error.network"]}
          </p>
        )}
      </div>
    </HomeCard>
  );
}
