// Interpolation and pt-BR formatters for the copy deck (spec v2 § Content & Copy
// rules). Dates render in Brasília time: the server can't know the phone's time
// zone without a hydration mismatch (plan § 1, assumption 1).

const TIME_ZONE = "America/Sao_Paulo";

/** The `{name}` placeholders in a copy template, as a union of their names. */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Key}}${infer Rest}`
    ? Key | Placeholders<Rest>
    : never;

/** Fills every `{placeholder}` in a copy template. The compiler requires each one. */
export function fill<S extends string>(
  template: S,
  values: Record<Placeholders<S>, string | number>,
): string {
  const lookup = values as Record<string, string | number>;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in lookup ? String(lookup[name]) : placeholder,
  );
}

function brasiliaParts(
  iso: string,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** `{data}`: dd/mm/aaaa. */
export function formatData(iso: string): string {
  const { day, month, year } = brasiliaParts(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${day}/${month}/${year}`;
}

/** `{data_hora}`: "dd/mm, hh:mm" on a 24 h clock. */
export function formatDataHora(iso: string): string {
  const { day, month, hour, minute } = brasiliaParts(iso, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${day}/${month}, ${hour}:${minute}`;
}

/** `{minutos}` from a Retry-After in seconds: whole minutes, never below 1. */
export function minutosFromSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** `{primeiro_nome}`: the first word of the name, exactly as typed. */
export function primeiroNome(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
