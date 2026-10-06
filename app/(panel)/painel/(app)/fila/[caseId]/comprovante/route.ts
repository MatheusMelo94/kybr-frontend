import { proofResponse } from "@/features/panel-fila/proof-route";

type Context = { params: Promise<{ caseId: string }> };

// D-C5 (AC 42, F12): the case's verification proof as a PDF attachment.
// GET only: any other method is a 405 from Next.
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  return proofResponse((await params).caseId);
}
