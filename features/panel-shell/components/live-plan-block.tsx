"use client";

import type { JSX } from "react";

import { PlanBlock } from "@/features/panel-shell/components/plan-block";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";

type Props = {
  contratarHref: string | undefined;
};

/** The plan block with the poller's latest plano (usage moves as checks are spent). */
export function LivePlanBlock({ contratarHref }: Props): JSX.Element | null {
  const { plano } = useShellStatus();
  return <PlanBlock plano={plano} contratarHref={contratarHref} />;
}
