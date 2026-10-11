import { fileDay } from "@/features/panel-shell/format";

// The audit export's period (plan-m8 D9, G11; Security O-F5): calendar days
// (yyyy-mm-dd, São Paulo), the last 3 months by default and at most 12, so
// a year's trail fits the 4 MiB cap. Plain code: the export leaf shares it
// and the panel's client leaves never import zod.

export const AUDIT_MAX_MONTHS = 12;
const AUDIT_DEFAULT_MONTHS = 3;

/** A real yyyy-mm-dd day, as UTC midnight; undefined otherwise. */
function day(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === value ? date : undefined;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** de ≤ ate, both real days, at most AUDIT_MAX_MONTHS apart. */
export function auditRangeOk(de: string, ate: string): boolean {
  const from = day(de);
  const to = day(ate);
  if (from === undefined || to === undefined || to < from) return false;
  return to <= addMonths(from, AUDIT_MAX_MONTHS);
}

/** The last 3 months up to today in São Paulo. */
export function defaultAuditRange(now: Date): { de: string; ate: string } {
  const ate = fileDay(now);
  const de = addMonths(new Date(`${ate}T00:00:00Z`), -AUDIT_DEFAULT_MONTHS);
  return { de: de.toISOString().slice(0, 10), ate };
}
