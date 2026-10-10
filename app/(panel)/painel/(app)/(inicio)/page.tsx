import type { Metadata } from "next";
import type { JSX } from "react";

import { Greeting } from "@/features/panel-home/components/greeting";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: shellCopy["nav.inicio"] };

// / is Início (spec S9; plan-m8 D1, PANEL_HOME). /me is the layout's read
// (React cache(), one request).
export default async function InicioPage(): Promise<JSX.Element> {
  const me = await requireSession();
  return (
    <div className="flex flex-col gap-6">
      <Greeting nome={me.nome} now={new Date()} />
    </div>
  );
}
