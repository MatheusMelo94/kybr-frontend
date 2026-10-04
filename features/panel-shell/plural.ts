// Plurals from separate .one / .other keys (spec § Content & Copy › Rules),
// chosen by pt-BR's rules (in pt-BR, 0 and 1 are "one").

const rules = new Intl.PluralRules("pt-BR");

/** The `.one` or `.other` template of `key` for `n`, still to be filled. */
export function plural<
  K extends string,
  D extends Record<`${K}.one` | `${K}.other`, string>,
>(deck: D, key: K, n: number): D[`${K}.one`] | D[`${K}.other`] {
  return rules.select(n) === "one" ? deck[`${key}.one`] : deck[`${key}.other`];
}
