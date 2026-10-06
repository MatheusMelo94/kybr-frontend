import type { Metadata } from "next";
import type { JSX } from "react";

import { FilaStub } from "@/features/panel-shell/components/fila-stub";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { requireSession } from "@/lib/api/panel/session";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: shellCopy["fila.h1"] };

// M4 stub: replaced in M6 by the Fila (list + case detail). /me is the
// layout's read (React cache(), one request), so the banner costs no call.
export default async function FilaPage(): Promise<JSX.Element> {
  const me = await requireSession();
  return (
    <FilaStub plano={me.workspace.plano} contratarHref={contratarHref()} />
  );
}
