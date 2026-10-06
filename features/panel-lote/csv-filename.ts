import { fileDay } from "@/features/panel-shell/format";

const SUFFIX = { result: "resultado", errors: "erros" } as const;

/**
 * kybr-lote-<yyyy-mm-dd>-resultado.csv / -erros.csv, the date in São Paulo.
 * Never a company name. The download handlers name the file by today; the
 * client leaf by the batch's end and never by the response's header
 * (Security C9).
 */
export function csvFilename(kind: "result" | "errors", date: Date): string {
  return `kybr-lote-${fileDay(date)}-${SUFFIX[kind]}.csv`;
}
