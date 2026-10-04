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
