import { redirect } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { loadHistory } from "@/features/panel-lote/data";
import { requireSession } from "@/lib/api/panel/session";

type Props = { children: ReactNode };

// /lote's gate, above its loading boundary (plan M5 D1): while the newest
// batch is processando, /lote opens it, server-side, before anything renders.
// requireSession() here and in the page (Security C10 / M4-13).
export default async function LoteGate({
  children,
}: Props): Promise<JSX.Element> {
  await requireSession();
  const history = await loadHistory();
  const newest = history.ok ? history.data[0] : undefined;
  if (newest?.estado === "processando") redirect(`/lote/${newest.id}`);
  return <>{children}</>;
}
