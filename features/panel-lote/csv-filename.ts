const SUFFIX = { result: "resultado", errors: "erros" } as const;

/**
 * kybr-lote-<yyyy-mm-dd>-resultado.csv / -erros.csv, the date in São Paulo.
 * Never a company name. The download handlers name the file by today; the
 * client leaf by the batch's end and never by the response's header
 * (Security C9).
 */
export function csvFilename(kind: "result" | "errors", date: Date): string {
  // P5-003: an invalid date falls back to today (never a RangeError).
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
  return `kybr-lote-${day}-${SUFFIX[kind]}.csv`;
}
