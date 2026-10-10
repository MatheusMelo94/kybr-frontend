import "server-only";

import { redirect } from "next/navigation";

import { defaultAuditRange } from "@/features/panel-sellers/audit-range";
import {
  auditExportSchema,
  sellersExportSchema,
} from "@/features/panel-sellers/schemas";
import { fileDay } from "@/features/panel-shell/format";
import type { CsvStream } from "@/lib/api/panel/sellers";
import {
  badGateway,
  badRequest,
  csvAttachment,
} from "@/lib/api/panel/csv-attachment";
import { assertPanelHost } from "@/lib/api/panel/host";
import { streamAuditCsv, streamSellersCsv } from "@/lib/api/panel/sellers";
import { requireSession, sessionExpiredUrl } from "@/lib/api/panel/session";

// The bodies of Vendedores' two GET export handlers (plan-m8 D9, AC 57;
// ADR-0011 order): host → zod on the query (a repeated or unknown key is
// refused) → requireSession() (tenancy from the session, O-F5) → the
// capped stream → csvAttachment(). Filenames are server-dated only.

/** The query as one value per key; undefined when a key repeats. */
function queryOf(url: URL): Record<string, string> | undefined {
  const entries = [...url.searchParams.entries()];
  const query = Object.fromEntries(entries);
  return Object.keys(query).length === entries.length ? query : undefined;
}

async function attachment(
  result: CsvStream,
  filename: string,
): Promise<Response> {
  if (!result.ok) {
    if (result.error.code === "SESSAO_EXPIRADA")
      redirect(await sessionExpiredUrl());
    return badGateway();
  }
  return csvAttachment(result.data.body, filename);
}

/** D-S4: the sellers CSV for the list's current q + status. */
export async function sellersCsvResponse(url: URL): Promise<Response> {
  await assertPanelHost();
  const parsed = sellersExportSchema.safeParse(queryOf(url));
  if (!parsed.success) return badRequest();
  await requireSession();
  const result = await streamSellersCsv(parsed.data);
  return attachment(result, `kybr-vendedores-${fileDay(new Date())}.csv`);
}

/** D-S5: the audit trail over de..ate (default: the last 3 months, G11). */
export async function auditCsvResponse(url: URL): Promise<Response> {
  await assertPanelHost();
  const query = queryOf(url);
  const parsed = auditExportSchema.safeParse(
    query !== undefined && Object.keys(query).length === 0
      ? defaultAuditRange(new Date())
      : query,
  );
  if (!parsed.success) return badRequest();
  await requireSession();
  const result = await streamAuditCsv(parsed.data);
  return attachment(result, `kybr-auditoria-${fileDay(new Date())}.csv`);
}
