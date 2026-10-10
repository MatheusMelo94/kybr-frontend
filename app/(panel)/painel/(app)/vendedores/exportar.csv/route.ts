import { sellersCsvResponse } from "@/features/panel-sellers/export-route";

// D-S4: the sellers CSV for the list's q + status, re-escaped (P08). GET
// only: any other method is a 405 from Next.
export async function GET(request: Request): Promise<Response> {
  return sellersCsvResponse(new URL(request.url));
}
