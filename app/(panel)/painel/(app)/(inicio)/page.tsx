import type { Metadata } from "next";
import type { JSX } from "react";

import { HomeView } from "@/features/panel-home/components/home-view";
import { loadHome } from "@/features/panel-home/data";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: shellCopy["nav.inicio"] };

// / is Início (spec S9; plan-m8 D1, PANEL_HOME). /me is the layout's read
// (React cache(), one request); D-H1 is the page's one read (D2).
export default async function InicioPage(): Promise<JSX.Element> {
  const me = await requireSession();
  const dashboard = await loadHome();
  return <HomeView me={me} dashboard={dashboard} now={new Date()} />;
}
