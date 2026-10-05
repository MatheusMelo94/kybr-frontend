"use client";

import type { JSX, ReactNode } from "react";

import { AccountMenu } from "@/features/panel-shell/components/account-menu";
import {
  PlanBlock,
  PlanSummary,
} from "@/features/panel-shell/components/plan-block";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";

type Props = {
  contratarHref: string | undefined;
};

/** The plan block with the poller's latest plano (usage moves as checks are spent). */
export function LivePlanBlock({ contratarHref }: Props): JSX.Element | null {
  const { plano } = useShellStatus();
  return <PlanBlock plano={plano} contratarHref={contratarHref} />;
}

type MenuProps = Props & {
  /** The menu's own items ("Sair"). */
  children: ReactNode;
};

/**
 * "Conta" below lg (AC 10): the live plan variant above the items, read on
 * open; "Contratar" joins the items when there's a plano and a contact.
 * Without a plano, the menu shows its items only.
 */
export function LivePlanAccountMenu({
  contratarHref,
  children,
}: MenuProps): JSX.Element {
  const { plano } = useShellStatus();
  return (
    <AccountMenu
      placement="down"
      className="shrink-0"
      description={
        plano && (
          <PlanSummary plano={plano} contratar={contratarHref !== undefined} />
        )
      }
    >
      {plano !== undefined && contratarHref !== undefined && (
        <a href={contratarHref} role="menuitem" className={MENU_LINK}>
          {shellCopy["plan.trial.cta"]}
        </a>
      )}
      {children}
    </AccountMenu>
  );
}

const MENU_LINK =
  "flex min-h-10 w-full items-center rounded-md px-3 text-body font-strong text-ink underline underline-offset-4 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";
