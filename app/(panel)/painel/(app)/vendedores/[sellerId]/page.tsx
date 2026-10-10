import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { SellerDetail } from "@/features/panel-sellers/components/seller-detail";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { planGate } from "@/features/panel-shell/plan-variant";
import { AppError } from "@/lib/api/errors";
import { getSeller } from "@/lib/api/panel/sellers";
import { requireSession } from "@/lib/api/panel/session";
import { isPanelId } from "@/lib/panel-api-values";

// O-F6: a static title, never the seller's name.
export const metadata: Metadata = { title: sellersCopy["sellers.h1"] };

type Props = { params: Promise<{ sellerId: string }> };

// /vendedores/{id} (AC 58): an id outside A-X3 is not found with no API
// call; an unknown or foreign one (D-S2's 404) gets the same not found
// (AC 73). The seller is read before anything streams, so the 404 is a real
// 404: no loading.tsx here (the M6 /fila/[caseId] pattern; the handoff's
// "no loading.tsx under /vendedores"). Errors go to vendedores/error.tsx.
export default async function SellerPage({
  params,
}: Props): Promise<JSX.Element> {
  const { sellerId } = await params;
  if (!isPanelId(sellerId)) notFound();
  const me = await requireSession();
  const seller = await getSeller(sellerId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "SELLER_NAO_ENCONTRADO")
      notFound();
    throw error;
  });
  return (
    <SellerDetail
      seller={seller}
      exhausted={planGate(me.workspace.plano) !== undefined}
    />
  );
}
