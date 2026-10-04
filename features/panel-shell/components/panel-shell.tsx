import type { JSX, ReactNode } from "react";

import { AccountMenu } from "@/features/panel-shell/components/account-menu";
import { LogoutItem } from "@/features/panel-shell/components/logout-item";
import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { PlanBlock } from "@/features/panel-shell/components/plan-block";
import { WorkspaceBlock } from "@/features/panel-shell/components/workspace-block";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { navItemsInBuild } from "@/features/panel-shell/nav";
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
 * main column. The narrow layout lands in T56.
 */
export function PanelShell({ shell, children }: Props): JSX.Element {
  const items = navItemsInBuild();
  return (
    <div className="lg:flex">
      <aside className="hidden w-(--size-sidebar) shrink-0 flex-col gap-6 border-r border-line p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <p className="px-3 text-body font-title text-ink">{globalCopy.brand}</p>
        <div className="px-3">
          <WorkspaceBlock
            nome={shell.workspaceNome}
            vendedores={shell.contagens?.vendedores}
          />
        </div>
        <PanelNav items={items} contagens={shell.contagens} />
        <div className="mt-auto flex flex-col gap-3">
          <PlanBlock plano={shell.plano} contratarHref={shell.contratarHref} />
          <AccountMenu>
            <LogoutItem />
          </AccountMenu>
        </div>
      </aside>
      {/* max-w-7xl is the page container (design-conventions --container-page: 80rem). */}
      <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
