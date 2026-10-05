import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { loadBatch } from "@/features/panel-lote/data";
import { isBatchId } from "@/features/panel-lote/validation";
import { requireSession } from "@/lib/api/panel/session";

type Props = {
  children: ReactNode;
  params: Promise<{ batchId: string }>;
};

// The batch's gate, above its loading boundary so a 404 is a real 404: an id
// outside A-X3/C10 → not found with no API call; unknown or foreign (PB10) →
// the same not found. Other failures fall through to the page, whose
// error.tsx shows error.load.* (the read is cached, so it isn't repeated).
// T81 adds BatchFocusKeeper here.
export default async function BatchLayout({
  children,
  params,
}: Props): Promise<JSX.Element> {
  const { batchId } = await params;
  if (!isBatchId(batchId)) notFound();
  await requireSession();
  const result = await loadBatch(batchId);
  if (!result.ok && result.error.code === "LOTE_NAO_ENCONTRADO") notFound();
  return <>{children}</>;
}
