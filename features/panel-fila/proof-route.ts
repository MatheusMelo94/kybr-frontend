import "server-only";

import { notFound, redirect } from "next/navigation";

import { proofFilename } from "@/features/panel-fila/proof-filename";
import { AppError } from "@/lib/api/errors";
import { getCase, streamCertificate } from "@/lib/api/panel/cases";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredUrl } from "@/lib/api/panel/session";
import { isPanelId } from "@/lib/panel-api-values";

const PRIVATE = "private, no-store";

/** Any failure past the checks: no detail in the body (P08). */
const badGateway = (): Response =>
  new Response(null, { status: 502, headers: { "Cache-Control": PRIVATE } });

/**
 * The comprovante handler's body (D-C5, AC 42, F12): host -> id -> session
 * -> the owner (tenancy) -> its own verification's certificate. The id only
 * picks the owner; the verification id comes from the owner's read (a case,
 * or a seller's current verification, T143). streamCertificate buffers up
 * to 5 MB and checks the type and %PDF- before this sends a header, so a
 * failure is a clean 502, never a truncated 200.
 */
export async function proofFor(
  id: string,
  verificationOf: (id: string) => Promise<string | undefined>,
): Promise<Response> {
  await assertPanelHost();
  if (!isPanelId(id)) notFound();
  await requireSession();

  let pdf: Uint8Array<ArrayBuffer>;
  try {
    const verificationId = await verificationOf(id);
    // G9: a seller with no current verification has no proof.
    if (verificationId === undefined) notFound();
    pdf = await streamCertificate(verificationId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (NOT_FOUND.has(error.code)) notFound();
    if (error.code === "SESSAO_EXPIRADA") redirect(await sessionExpiredUrl());
    return badGateway();
  }

  return new Response(pdf, {
    status: 200,
    headers: {
      // Set here, never forwarded from the backend.
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${proofFilename(new Date())}"`,
      "Cache-Control": PRIVATE,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

const NOT_FOUND: ReadonlySet<string> = new Set([
  "CASO_NAO_ENCONTRADO",
  "SELLER_NAO_ENCONTRADO",
  "RECURSO_NAO_ENCONTRADO",
]);

/** /fila/{id}/comprovante: the case's verification. */
export async function proofResponse(caseId: string): Promise<Response> {
  return proofFor(caseId, async (id) => (await getCase(id)).verification.id);
}
