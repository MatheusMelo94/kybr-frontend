import type { JSX } from "react";

import { Table, Td, Th } from "@/components/panel/table";
import { StatusDot } from "@/components/ui/status-dot";
import { filaCopy } from "@/features/panel-fila/copy";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { SELLER_STATUS_WORDS } from "@/features/panel-sellers/status-words";
import { fill, formatDate } from "@/features/panel-shell/format";
import type { SellerRow } from "@/lib/api/schemas/panel/sellers";

/** "Mudou: {resumo}" when the backend sent one, else the filter's word. */
function statusText(row: SellerRow): string {
  if (row.status === "mudou" && row.mudou !== undefined)
    return fill(sellersCopy["sellers.status.changed"], {
      resumo: row.mudou.resumo,
    });
  return SELLER_STATUS_WORDS[row.status].word;
}

/**
 * Vendedores' table (AC 55): the razão social with the masked CNPJ under it
 * (both masked by the data layer, O-F4), the responsável, the origin word,
 * the date (dd/mm/aaaa, São Paulo), the status word + dot and Sim/Não. The
 * card scrolls sideways when the six columns don't fit (at 360, and by a
 * few pixels at 768: their min-content is about 780 px). Server-safe.
 */
export function SellersTable({ rows }: { rows: SellerRow[] }): JSX.Element {
  return (
    <Table label={sellersCopy["sellers.h1"]}>
      <thead>
        <tr>
          <Th>{sellersCopy["sellers.col.seller"]}</Th>
          <Th>{sellersCopy["sellers.col.resp"]}</Th>
          <Th>{sellersCopy["sellers.col.origin"]}</Th>
          <Th>{sellersCopy["sellers.col.date"]}</Th>
          <Th>{sellersCopy["sellers.col.status"]}</Th>
          <Th>{sellersCopy["sellers.col.monitored"]}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-seller-row={row.id}>
            <Td>
              {row.razao_social !== null && (
                <span className="block font-strong break-words">
                  {row.razao_social}
                </span>
              )}
              <span
                className={
                  row.razao_social !== null ? "block text-ink-muted" : "block"
                }
              >
                {row.cnpj}
              </span>
            </Td>
            <Td>{row.responsavel ?? sellersCopy["sellers.resp.none"]}</Td>
            <Td>
              {row.origem === "link"
                ? filaCopy["fila.origin.link"]
                : filaCopy["fila.origin.lote"]}
            </Td>
            <Td>{formatDate(row.verificado_em)}</Td>
            <Td>
              <span className="inline-flex items-center gap-2 text-ink">
                <StatusDot tone={SELLER_STATUS_WORDS[row.status].tone} />
                {statusText(row)}
              </span>
            </Td>
            <Td>
              {row.monitorado
                ? sellersCopy["sellers.monitored.yes"]
                : sellersCopy["sellers.monitored.no"]}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
