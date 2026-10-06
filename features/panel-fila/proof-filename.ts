import { fileDay } from "@/features/panel-shell/format";

/**
 * kybr-comprovante-<yyyy-mm-dd>.pdf, the date in São Paulo (AC 42). Never a
 * company name (P08). The handler names the file by its own clock; the leaf
 * by the browser's, never by the response's header (C9).
 */
export function proofFilename(date: Date): string {
  return `kybr-comprovante-${fileDay(date)}.pdf`;
}
