// The Fila's dates (spec § Content & Copy › Rules › Numbers and dates), in
// Brasília time: the server can't know the browser's zone without a
// hydration mismatch. {duracao} is panel-shell's formatDuration.

const TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

function brasiliaParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** The Brasília calendar day, as a day count (for differences only). */
function brasiliaDay(date: Date): number {
  const { year, month, day } = brasiliaParts(date);
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS;
}

/** `{data_hora}`: "dd/mm, hh:mm" on a 24 h clock. */
export function formatDataHora(iso: string): string {
  const { day, month, hour, minute } = brasiliaParts(new Date(iso));
  return `${day}/${month}, ${hour}:${minute}`;
}

/** `{hora}` (offline.panel): "hh:mm" on a 24 h clock, from an epoch ms. */
export function formatHora(ms: number): string {
  const { hour, minute } = brasiliaParts(new Date(ms));
  return `${hour}:${minute}`;
}

/**
 * The feed's and timeline's relative date: "hoje, 11:37", "ontem",
 * "há 3 dias", by Brasília calendar day. A later day (clock skew) shows
 * {data_hora} instead.
 */
export function formatRelativo(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = brasiliaDay(now) - brasiliaDay(date);
  if (days === 0) {
    const { hour, minute } = brasiliaParts(date);
    return `hoje, ${hour}:${minute}`;
  }
  if (days === 1) return "ontem";
  if (days > 1) return `há ${days} dias`;
  return formatDataHora(iso);
}
