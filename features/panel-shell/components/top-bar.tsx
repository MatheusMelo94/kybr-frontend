import type { JSX } from "react";

import { LivePlanAccountMenu } from "@/features/panel-shell/components/live-plan-block";
import { LogoutItem } from "@/features/panel-shell/components/logout-item";

type Props = {
  workspaceNome: string;
  /** A mailto: from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

/** Below lg (AC 10): the workspace name and the "Conta" menu with the plan variant. */
export function TopBar({ workspaceNome, contratarHref }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <p className="min-w-0 text-body font-strong break-words text-ink">
        {workspaceNome}
      </p>
      <LivePlanAccountMenu contratarHref={contratarHref}>
        <LogoutItem />
      </LivePlanAccountMenu>
    </div>
  );
}
