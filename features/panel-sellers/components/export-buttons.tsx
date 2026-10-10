"use client";

import { useId, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fileDay, fill, formatNumber } from "@/features/panel-shell/format";
import { useFileDownload } from "@/features/panel-shell/use-file-download";
import type { SellerStatus } from "@/lib/panel-api-values";

type Props = {
  /** The list's current filter (the export ignores the page). */
  search: { status?: SellerStatus | undefined; q?: string | undefined };
  /** The list's total, for the hint. */
  total: number;
  /** The default period, from the server (the last 3 months, G11). */
  auditRange: { de: string; ate: string };
};

function exportHref(search: Props["search"]): string {
  const params = new URLSearchParams();
  if (search.status !== undefined) params.set("status", search.status);
  if (search.q !== undefined) params.set("q", search.q);
  const query = params.toString();
  return `/vendedores/exportar.csv${query === "" ? "" : `?${query}`}`;
}

/**
 * Vendedores' exports (AC 57, plan-m8 D9): "Exportar CSV" for the current
 * filter, described by its count, and the audit trail over De/Até. Both go
 * through the re-escaping GET handlers via useFileDownload (busy, a blob,
 * revoked; the name built here, C9). A failure is export.error inline; the
 * audit adds export.too_large, since its 502 says nothing more and the
 * period is the lever (O-F5, G11).
 */
export function ExportButtons({
  search,
  total,
  auditRange,
}: Props): JSX.Element {
  const hintId = useId();
  const [de, setDe] = useState(auditRange.de);
  const [ate, setAte] = useState(auditRange.ate);
  const sellers = useFileDownload(
    exportHref(search),
    () => `kybr-vendedores-${fileDay(new Date())}.csv`,
  );
  const audit = useFileDownload(
    `/vendedores/auditoria.csv?${new URLSearchParams({ de, ate }).toString()}`,
    () => `kybr-auditoria-${fileDay(new Date())}.csv`,
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="panel"
          busy={sellers.busy}
          aria-describedby={hintId}
          onClick={() => void sellers.download()}
        >
          {sellersCopy["sellers.export"]}
        </Button>
        <p id={hintId} className="text-secondary text-ink-muted">
          {total === 1
            ? sellersCopy["sellers.export.hint.one"]
            : fill(sellersCopy["sellers.export.hint.other"], {
                n: formatNumber(total),
              })}
        </p>
        {sellers.failed && (
          <p role="alert" className="text-secondary text-danger-ink">
            {globalCopy["export.error"]}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <TextField
          type="date"
          name="de"
          label={sellersCopy["audit.de"]}
          value={de}
          onChange={(event) => setDe(event.target.value)}
          tabularNums
        />
        <TextField
          type="date"
          name="ate"
          label={sellersCopy["audit.ate"]}
          value={ate}
          onChange={(event) => setAte(event.target.value)}
          tabularNums
        />
        <Button
          variant="secondary"
          size="panel"
          busy={audit.busy}
          onClick={() => void audit.download()}
        >
          {sellersCopy["sellers.audit"]}
        </Button>
        {audit.failed && (
          <p role="alert" className="basis-full text-secondary text-danger-ink">
            {globalCopy["export.error"]} {sellersCopy["export.too_large"]}
          </p>
        )}
      </div>
    </div>
  );
}
