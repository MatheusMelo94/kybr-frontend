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
 * -> the case (tenancy) -> its own verification's certificate. The id only
 * picks the case; the verification id comes from the case. streamCertificate
 * buffers up to 5 MB and checks the type and %PDF- before this sends a
 * header, so a failure is a clean 502, never a truncated 200.
 */
export async function proofResponse(caseId: string): Promise<Response> {
  await assertPanelHost();
  if (!isPanelId(caseId)) notFound();
  await requireSession();

  let pdf: Uint8Array<ArrayBuffer>;
  try {
    const record = await getCase(caseId);
    pdf = await streamCertificate(record.verification.id);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (
      error.code === "CASO_NAO_ENCONTRADO" ||
      error.code === "RECURSO_NAO_ENCONTRADO"
    )
      notFound();
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
