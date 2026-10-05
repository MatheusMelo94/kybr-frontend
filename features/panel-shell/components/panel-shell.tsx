import type { JSX, ReactNode } from "react";

import { AccountMenu } from "@/features/panel-shell/components/account-menu";
import { LogoutItem } from "@/features/panel-shell/components/logout-item";
import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { SkipLink } from "@/features/panel-shell/components/skip-link";
import { BfcacheGuard } from "@/features/panel-shell/components/bfcache-guard";
import { SessionExpiryProvider } from "@/features/panel-shell/components/session-expiry-provider";
import { LivePlanBlock } from "@/features/panel-shell/components/live-plan-block";
import { ShellStatusPoller } from "@/features/panel-shell/components/shell-status-poller";
import { TopBar } from "@/features/panel-shell/components/top-bar";
import { WorkspaceBlock } from "@/features/panel-shell/components/workspace-block";
import { navItemsInBuild } from "@/features/panel-shell/nav";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";
import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";

/** What the shell needs from /me: a projection, never the raw object or the session. */
export type ShellProjection = {
  workspaceNome: string;
  contagens: Contagens | undefined;
  plano: Plano | undefined;
  contratarHref: string | undefined;
};

type Props = {
  shell: ShellProjection;
  children: ReactNode;
};

/**
 * The signed-in panel (spec S5): at lg (1024) and up a 240 px sticky sidebar
 * (brand, workspace, nav with counts, plan block, account menu) beside the
 * main column; below it, a top bar and a row of scrolling tabs (AC 10).
 */
export function PanelShell({ shell, children }: Props): JSX.Element {
  const items = navItemsInBuild();
  return (
    <SessionExpiryProvider>
      <ShellStatusProvider
        initial={{ contagens: shell.contagens, plano: shell.plano }}
      >
        <ShellStatusPoller />
        <BfcacheGuard />
        <SkipLink />
        <div className="lg:flex">
          <header className="border-b border-line lg:hidden">
            <TopBar
              workspaceNome={shell.workspaceNome}
              contratarHref={shell.contratarHref}
            />
            <div className="pb-2">
              <PanelNav items={items} variant="tabs" />
            </div>
          </header>
          <aside className="hidden w-(--size-sidebar) shrink-0 flex-col gap-6 border-r border-line p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh">
            {/* The sidebar top, then a hairline before the nav (Aplicações board). */}
            <div className="border-b border-line px-3 pb-4">
              <WorkspaceBlock nome={shell.workspaceNome} plano={shell.plano} />
            </div>
            <PanelNav items={items} />
            <div className="mt-auto flex flex-col gap-3">
              <LivePlanBlock contratarHref={shell.contratarHref} />
              <AccountMenu>
                <LogoutItem />
              </AccountMenu>
            </div>
          </aside>
          {/* max-w-7xl is the page container (design-conventions --container-page: 80rem). */}
          <main
            id="conteudo"
            // The skip link's target: focusable by script, not by Tab.
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8"
          >
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </ShellStatusProvider>
    </SessionExpiryProvider>
  );
}
