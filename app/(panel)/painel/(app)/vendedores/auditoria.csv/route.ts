import { auditCsvResponse } from "@/features/panel-sellers/export-route";

// D-S5: the audit trail over de..ate, re-escaped (P08). GET only: any other
// method is a 405 from Next.
export async function GET(request: Request): Promise<Response> {
  return auditCsvResponse(new URL(request.url));
}
