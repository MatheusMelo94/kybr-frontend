import { documentResponse } from "@/features/panel-fila/document-route";

type Context = { params: Promise<{ caseId: string; docId: string }> };

// D6 (Q1, F1–F4): a seller's document, as a 303 to a fresh signed URL or
// the F4 attachment (PANEL_DOCUMENTS_MODE). GET only: any other method is a
// 405 from Next.
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  const { caseId, docId } = await params;
  return documentResponse(caseId, docId);
}
