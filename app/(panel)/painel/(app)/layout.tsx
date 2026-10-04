import { redirect } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { PanelShell } from "@/features/panel-shell/components/panel-shell";
import { requireSession } from "@/lib/api/panel/session";
import { commercialContactEmail } from "@/lib/panel-config";

type Props = {
  children: ReactNode;
};

// The signed-in panel (plan § 2.2): a session, onboarding done, then the
// shell around every (app) screen. Client leaves get a projection of /me.
export default async function AppLayout({
  children,
}: Props): Promise<JSX.Element> {
  const me = await requireSession();
  if (!me.workspace.onboarding_concluido) redirect("/comecar");
  const email = commercialContactEmail();

  return (
    <PanelShell
      shell={{
        workspaceNome: me.workspace.nome,
        contagens: me.workspace.contagens,
        plano: me.workspace.plano,
        contratarHref: email === undefined ? undefined : `mailto:${email}`,
      }}
    >
      {children}
    </PanelShell>
  );
}
