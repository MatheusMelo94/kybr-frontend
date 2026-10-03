import * as z from "zod/mini";

import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// Shared by the client (inline validation) and the Server Actions (authoritative).
// zod/mini keeps the client bundle small (ADR-0003 rule 3).
//
// Issue messages are reason codes, never copy: the form maps (field, reason) to
// the spec key, e.g. cnpj + "check_letters" → form.cnpj.error.check_letters.

export type CnpjIssue = "empty" | "incomplete" | "check_letters" | "invalid";
/** `invalid` only comes from a tampered request: the name field filters as typed (F07). */
export type ResponsavelIssue = "empty" | "single" | "invalid";
export type EmailIssue = "empty" | "invalid";

/** Threat model F07: a name is at most 120 characters. */
export const RESPONSAVEL_MAX_LENGTH = 120;
const PASSTHROUGH_MAX_LENGTH = 256;

// Unicode letters (with combining marks), space, apostrophe, hyphen, period (F07).
const RESPONSAVEL_PATTERN = /^[\p{L}\p{M} '.-]+$/u;
const NOT_A_NAME_CHARACTER = /[^\p{L}\p{M} '.-]/gu;
// Printable ASCII only: no control characters and nothing non-ASCII (F07).
const PASSTHROUGH_PATTERN = /^[\x20-\x7E]+$/;

/** NFC, with typographic apostrophes (iOS smart punctuation) read as '. */
function canonicalName(raw: string): string {
  return raw.normalize("NFC").replace(/[‘’]/g, "'");
}

/**
 * The name field's filter, applied as the seller types: anything a name can't
 * hold is ignored, and input stops at 120 characters. No new copy is needed
 * (F07); the schema below still rejects tampered requests.
 */
export function filterResponsavel(raw: string): string {
  return canonicalName(raw)
    .replace(NOT_A_NAME_CHARACTER, "")
    .slice(0, RESPONSAVEL_MAX_LENGTH);
}

/** A missing value reads as "" so it gets the field's own `empty` reason. */
const text = z.pipe(
  z.optional(z.string()),
  z.transform((value) => value ?? ""),
);

/** Normalized to 14 uppercase alphanumerics: the wire format D2 and D3 expect (contract X5). */
const cnpj = z.pipe(text, z.transform(normalizeCnpj)).check(
  z.superRefine((value, ctx) => {
    const result = validateCnpj(value);
    if (result !== "ok")
      ctx.issues.push({ code: "custom", message: result, input: value });
  }),
);

/**
 * NFC, trimmed, inner whitespace collapsed. At most 120 characters of letters,
 * spaces, ', - and . (F07), and at least two words (nome e sobrenome).
 */
const responsavel = z
  .pipe(
    text,
    z.transform((value) => canonicalName(value).trim().replace(/\s+/g, " ")),
  )
  .check(
    z.superRefine((value, ctx) => {
      let reason: ResponsavelIssue | undefined;
      if (value === "") reason = "empty";
      else if (
        value.length > RESPONSAVEL_MAX_LENGTH ||
        !RESPONSAVEL_PATTERN.test(value)
      )
        reason = "invalid";
      else if (value.split(" ").length < 2) reason = "single";
      if (reason)
        ctx.issues.push({ code: "custom", message: reason, input: value });
    }),
  );

/**
 * `?ref=` / `?ext_id=`: passed through untouched when they're 1–256 printable
 * ASCII characters. Anything else is dropped, never echoed (F07).
 */
const passthrough = z.pipe(
  z.optional(z.unknown()),
  z.transform((value) =>
    typeof value === "string" &&
    value.length <= PASSTHROUGH_MAX_LENGTH &&
    PASSTHROUGH_PATTERN.test(value)
      ? value
      : undefined,
  ),
);

export const verifySchema = z.object({
  cnpj,
  responsavel,
  ref: passthrough,
  ext_id: passthrough,
});

export type VerifyInput = z.output<typeof verifySchema>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const contactEmailSchema = z.object({
  email: z
    .pipe(
      text,
      z.transform((value) => value.trim()),
    )
    .check(
      z.superRefine((value, ctx) => {
        const reason: EmailIssue | undefined =
          value === ""
            ? "empty"
            : EMAIL_PATTERN.test(value)
              ? undefined
              : "invalid";
        if (reason)
          ctx.issues.push({ code: "custom", message: reason, input: value });
      }),
    ),
});

export type ContactEmailInput = z.output<typeof contactEmailSchema>;
