import type { StatusTone } from "@/components/ui/status-dot";
import { sellersCopy } from "@/features/panel-sellers/copy";
import type { SellerStatus } from "@/lib/panel-api-values";

/** Each status's word (the filter's) and dot (DDR-0003: a dot, the word in ink). */
export const SELLER_STATUS_WORDS: Record<
  SellerStatus,
  { word: string; tone: StatusTone }
> = {
  aprovado: { word: sellersCopy["sellers.filter.ok"], tone: "success" },
  revisao: { word: sellersCopy["sellers.filter.review"], tone: "warning" },
  bloqueado: { word: sellersCopy["sellers.filter.blocked"], tone: "danger" },
  mudou: { word: sellersCopy["sellers.filter.changed"], tone: "warning" },
};
