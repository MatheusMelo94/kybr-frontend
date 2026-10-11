import "server-only";

import { proofFor } from "@/features/panel-fila/proof-route";
import { getSeller } from "@/lib/api/panel/sellers";

/**
 * /vendedores/{id}/comprovante (AC 58): M6's proof body over the seller
 * read (tenancy: a foreign or unknown seller is the same not found, AC 73),
 * for its current verification.
 */
export async function sellerProofResponse(sellerId: string): Promise<Response> {
  return proofFor(
    sellerId,
    async (id) => (await getSeller(id)).verificacao_atual?.id,
  );
}
