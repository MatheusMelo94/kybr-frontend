// The CNPJ domain, shared by every surface (link, panel search, batch CSV,
// displays). Spec v2 § CNPJ field behavior; Receita IN RFB 2.229/2024: since
// July 2026 positions 1–12 may hold letters A–Z; positions 13–14 (the check
// digits) are always digits. Numeric CNPJs validate exactly as before.

export const CNPJ_LENGTH = 14;

export type CnpjValidation =
  "ok" | "empty" | "incomplete" | "check_letters" | "invalid";

/**
 * Keeps ASCII [0-9A-Za-z] first, then uppercases, then cuts to 14.
 * Filtering first means É, ç and ß are dropped (never folded or expanded), and
 * look-alikes (O/0, I/1) are never corrected: validation catches them.
 */
export function normalizeCnpj(raw: string): string {
  return raw
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, CNPJ_LENGTH);
}

/** `00.000.000/0000-00` for both formats; partial input gets no trailing separator. */
export function maskCnpj(normalized: string): string {
  const separators: Readonly<Record<number, string>> = {
    2: ".",
    5: ".",
    8: "/",
    12: "-",
  };
  let masked = "";
  for (const [index, char] of [...normalized].entries()) {
    masked += (separators[index] ?? "") + char;
  }
  return masked;
}

/** Each character is worth its ASCII code minus 48 (0–9 → 0–9, A → 17 … Z → 42). */
function checkDigit(characters: string): number {
  let sum = 0;
  let weight = 2; // weights 2–9 cycle from the right
  for (let index = characters.length - 1; index >= 0; index--) {
    sum += (characters.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Validates a normalizeCnpj() result. Anything outside [0-9A-Z] is `invalid`. */
export function validateCnpj(normalized: string): CnpjValidation {
  if (normalized.length === 0) return "empty";
  if (normalized.length < CNPJ_LENGTH) return "incomplete";
  if (!/^[0-9A-Z]{14}$/.test(normalized)) return "invalid";
  if (!/^[0-9]{2}$/.test(normalized.slice(12))) return "check_letters";
  if (/^(.)\1{13}$/.test(normalized)) return "invalid";

  const body = normalized.slice(0, 12);
  const first = checkDigit(body);
  const second = checkDigit(`${body}${first}`);
  return normalized.slice(12) === `${first}${second}` ? "ok" : "invalid";
}
