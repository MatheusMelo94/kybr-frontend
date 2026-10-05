import type { JSX } from "react";

import { AccountMenu } from "@/features/panel-shell/components/account-menu";
import { LogoutItem } from "@/features/panel-shell/components/logout-item";

type Props = {
  workspaceNome: string;
};

/** Below lg (AC 10): the workspace name and the "Conta" menu. */
export function TopBar({ workspaceNome }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <p className="min-w-0 text-body font-strong break-words text-ink">
        {workspaceNome}
      </p>
      <AccountMenu placement="down" className="shrink-0">
        <LogoutItem />
      </AccountMenu>
    </div>
  );
}
