import { batchCsvResponse } from "@/features/panel-lote/download-route";

type Context = { params: Promise<{ batchId: string }> };

// D-B4: the batch's result CSV, re-escaped (P08). GET only: any other
// method is a 405 from Next.
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  return batchCsvResponse((await params).batchId, "result");
}
