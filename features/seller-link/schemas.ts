import * as z from "zod/mini";

import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// Shared by the client (inline validation) and the Server Actions (authoritative).
// zod/mini keeps the client bundle small (ADR-0003 rule 3).
//
// Issue messages are reason codes, never copy: the form maps (field, reason) to
// the spec key, e.g. cnpj + "check_letters" → form.cnpj.error.check_letters.

export type CnpjIssue = "empty" | "incomplete" | "check_letters" | "invalid";
/** `invalid`: a filled-in name the backend rejects (D3, AC 10), or a tampered request (F07). */
export type ResponsavelIssue = "empty" | "single" | "invalid";
export type EmailIssue = "empty" | "invalid";

const CNPJ_ISSUES: readonly CnpjIssue[] = [
  "empty",
  "incomplete",
  "check_letters",
  "invalid",
];
const RESPONSAVEL_ISSUES: readonly ResponsavelIssue[] = [
  "empty",
  "single",
  "invalid",
];

/** The first issue per form field, narrowed from the schema's reason codes. */
export type FieldIssues = {
  cnpj?: CnpjIssue;
  responsavel?: ResponsavelIssue;
};

export function fieldIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldIssues {
  const first = <T extends string>(
    field: string,
    allowed: readonly T[],
  ): T | undefined => {
    const message = issues.find((issue) => issue.path[0] === field)?.message;
    return allowed.find((reason) => reason === message);
  };
  const cnpj = first("cnpj", CNPJ_ISSUES);
  const responsavel = first("responsavel", RESPONSAVEL_ISSUES);
  return {
    ...(cnpj !== undefined && { cnpj }),
    ...(responsavel !== undefined && { responsavel }),
  };
}

/** Threat model F07: a name is at most 120 characters. */
export const RESPONSAVEL_MAX_LENGTH = 120;
const PASSTHROUGH_MAX_LENGTH = 256;

// F07 + security finding 0001: Unicode letters, each with at most two
// combining marks (after NFC, Portuguese needs none), plus space, apostrophe,
// hyphen and period. The Hangul fillers are letters (Lo) that render blank,
// so they're excluded.
const BLANK_LETTERS = "\\u115F\\u1160\\u3164\\uFFA0";
const BLANK_LETTER = new RegExp(`[${BLANK_LETTERS}]`, "u");
const MAX_MARKS_PER_LETTER = 2;
const RESPONSAVEL_PATTERN = new RegExp(
  `^(?:(?![${BLANK_LETTERS}])\\p{L}\\p{M}{0,${MAX_MARKS_PER_LETTER}}|[ '.-])+$`,
  "u",
);
const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const NAME_PUNCTUATION = /[ '.-]/;
// Printable ASCII only: no control characters and nothing non-ASCII (F07).
const PASSTHROUGH_PATTERN = /^[\x20-\x7E]+$/;

// Apostrophe look-alikes (spec § Name field behavior): ’ (iOS smart
// punctuation), ‘, ʼ, and the ´ and ` that Brazilian keyboards type. Only
// completed characters reach here: the field doesn't filter mid-composition.
const APOSTROPHE_LOOK_ALIKES = /[\u2018\u2019\u02BC\u00B4\u0060]/g;

/** NFC, with every apostrophe look-alike read as '. */
function canonicalName(raw: string): string {
  return raw.normalize("NFC").replace(APOSTROPHE_LOOK_ALIKES, "'");
}

/**
 * The name field's filter, applied as the seller types: anything a name can't
 * hold is ignored, and input stops at 120 characters. No new copy is needed
 * (F07); the schema below still rejects tampered requests.
 */
export function filterResponsavel(raw: string): string {
  let kept = "";
  // Marks kept on the current letter; null when no letter precedes them.
  let marks: number | null = null;
  for (const character of canonicalName(raw)) {
    if (LETTER.test(character) && !BLANK_LETTER.test(character)) {
      kept += character;
      marks = 0;
    } else if (MARK.test(character)) {
      if (marks !== null && marks < MAX_MARKS_PER_LETTER) {
        kept += character;
        marks += 1;
      }
    } else if (NAME_PUNCTUATION.test(character)) {
      kept += character;
      marks = null;
    }
  }
  return kept.slice(0, RESPONSAVEL_MAX_LENGTH);
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

/** The link's ?ref= and ?ext_id=, for the page to hand to the form. */
export const passthroughSchema = z.object({
  ref: passthrough,
  ext_id: passthrough,
});

export type Passthrough = z.output<typeof passthroughSchema>;

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
