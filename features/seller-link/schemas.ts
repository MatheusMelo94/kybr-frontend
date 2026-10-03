import * as z from "zod/mini";

import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// Shared by the client (inline validation) and the Server Actions (authoritative).
// zod/mini keeps the client bundle small (ADR-0003 rule 3).
//
// Issue messages are reason codes, never copy: the form maps (field, reason) to
// the spec key, e.g. cnpj + "check_letters" → form.cnpj.error.check_letters.

export type CnpjIssue = "empty" | "incomplete" | "check_letters" | "invalid";
export type ResponsavelIssue = "empty" | "single";
export type EmailIssue = "empty" | "invalid";

const PASSTHROUGH_MAX_LENGTH = 256;

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

/** Trimmed, inner whitespace collapsed; at least two words (nome e sobrenome). */
const responsavel = z
  .pipe(
    text,
    z.transform((value) => value.trim().replace(/\s+/g, " ")),
  )
  .check(
    z.superRefine((value, ctx) => {
      const reason: ResponsavelIssue | undefined =
        value === ""
          ? "empty"
          : value.split(" ").length < 2
            ? "single"
            : undefined;
      if (reason)
        ctx.issues.push({ code: "custom", message: reason, input: value });
    }),
  );

/** `?ref=` / `?ext_id=`: passed through untouched when 1–256 characters, otherwise dropped. */
const passthrough = z.pipe(
  z.optional(z.unknown()),
  z.transform((value) =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PASSTHROUGH_MAX_LENGTH
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
