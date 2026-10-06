// Interpolation and pt-BR formatting for the panel's copy deck (spec
// § Content & Copy › Rules). Sentences are filled, never concatenated.

/** The `{name}` placeholders in a copy template, as a union of their names. */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Key}}${infer Rest}`
    ? Key | Placeholders<Rest>
    : never;

/**
 * Fills every `{placeholder}` in a copy template; the compiler requires each
 * one. An unknown placeholder stays visible (a bug to see, not hidden text).
 */
export function fill<S extends string>(
  template: S,
  values: Record<Placeholders<S>, string | number>,
): string {
  const lookup = values as Record<string, string | number>;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in lookup ? String(lookup[name]) : placeholder,
  );
}

const numbers = new Intl.NumberFormat("pt-BR");

/** Numbers in pt-BR: 1240 → "1.240". */
export function formatNumber(value: number): string {
  return numbers.format(value);
}

/** `{minutos}` from a Retry-After in seconds: at least 1 (plan § 2.9). */
export function minutesFromSeconds(seconds: number | undefined): number {
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}

/** `{data}`: dd/mm/aaaa in Brasília time (spec § Content & Copy › Rules). */
export function formatDate(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/**
 * `{duracao}` (spec § Content & Copy › Durations): "41 s", "3 min", "2 h",
 * "2 dias", each unit rounded down from the one below it.
 */
export function formatDuration(ms: number): string {
  // P5-003: a duration from a bad date is 0 s, never "NaN s".
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** yyyy-mm-dd in São Paulo, for file names; an invalid date is today (P5-003). */
export function fileDay(date: Date): string {
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}
