import type { JSX } from "react";

import { Table, Td, Th } from "@/components/panel/table";
import { StatusWord } from "@/features/panel-lote/components/status-word";
import { loteCopy } from "@/features/panel-lote/copy";
import { maskCnpj } from "@/lib/cnpj";
import type { BatchRowsPage } from "@/lib/api/schemas/panel/batches";

/**
 * The result's rows (AC 20; contract C2): 25 per page in file order. The CNPJ
 * masked in tabular figures (AC 76), the status as a dot + its word, the
 * motivos as given by the backend (D-C2), as a list. A missing razão social
 * is empty; long text wraps. Backend text is React text only.
 */
export function ResultTable({ page }: { page: BatchRowsPage }): JSX.Element {
  return (
    <Table label={loteCopy["lote.result.h"]}>
      <thead>
        <tr>
          <Th>{loteCopy["lote.table.cnpj"]}</Th>
          <Th>{loteCopy["lote.table.razao"]}</Th>
          <Th>{loteCopy["lote.table.status"]}</Th>
          <Th>{loteCopy["lote.table.motivos"]}</Th>
        </tr>
      </thead>
      <tbody>
        {page.itens.map((row, index) => (
          <tr key={`${row.cnpj}-${index}`}>
            <Td className="whitespace-nowrap tabular-nums">
              {maskCnpj(row.cnpj)}
            </Td>
            <Td>{row.razao_social ?? ""}</Td>
            <Td className="whitespace-nowrap">
              <StatusWord status={row.status} />
            </Td>
            <Td>
              {row.motivos.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {row.motivos.map((motivo, at) => (
                    <li key={at}>{motivo}</li>
                  ))}
                </ul>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
