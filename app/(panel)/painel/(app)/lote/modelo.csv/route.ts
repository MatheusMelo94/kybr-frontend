import {
  TEMPLATE_CSV,
  TEMPLATE_FILENAME,
} from "@/features/panel-lote/template";
import { assertPanelHost } from "@/lib/api/panel/host";

// D-B8: the static template, a GET with a constant body (ADR-0011 rule 4).
// It reads no session data; off the panel host it's a 404 (P03.2).
export async function GET(): Promise<Response> {
  await assertPanelHost();
  return new Response(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILENAME}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
