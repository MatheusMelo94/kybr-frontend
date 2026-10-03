"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type JSX,
  type Ref,
} from "react";

import { TextField } from "@/components/ui/text-field";
import { formCopy } from "@/features/seller-link/copy/form";
import type { CnpjIssue } from "@/features/seller-link/schemas";
import { CNPJ_LENGTH, maskCnpj, normalizeCnpj, validateCnpj } from "@/lib/cnpj";

/**
 * The CNPJ field's keyboard. Owner decision (spec v2): the text keyboard in
 * capital letters for every seller, since alphanumeric CNPJs need letters, with
 * autocorrect and suggestions off. A different keyboard is a change here only.
 */
export const CNPJ_KEYBOARD = {
  type: "text",
  inputMode: "text",
  autoCapitalize: "characters",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
} as const;

const ERROR_COPY: Record<CnpjIssue, string> = {
  empty: formCopy["form.cnpj.error.empty"],
  incomplete: formCopy["form.cnpj.error.incomplete"],
  check_letters: formCopy["form.cnpj.error.check_letters"],
  invalid: formCopy["form.cnpj.error.invalid"],
};

/** The index in `masked` just after its `count`-th CNPJ character. */
function caretAfter(masked: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  for (const [index, char] of [...masked].entries()) {
    if (/[0-9A-Z]/.test(char) && ++seen === count) return index + 1;
  }
  return masked.length;
}

type Props = {
  /** The normalized CNPJ (lib/cnpj.ts): up to 14 uppercase characters, no punctuation. */
  value: string;
  onValueChange: (normalized: string) => void;
  /** Called once per distinct valid 14-character CNPJ: the lookup trigger. */
  onValidCnpj: (normalized: string) => void;
  /** A submit-time issue (empty, incomplete) from the form. */
  submitError?: CnpjIssue | undefined;
  ref?: Ref<HTMLInputElement>;
};

/**
 * The alphanumeric CNPJ input (spec v2 § CNPJ field behavior). Every keystroke
 * and paste goes through normalizeCnpj, then shows masked. At 14 characters it
 * validates on the device; earlier, only a submit-time issue shows.
 */
export function CnpjField({
  value,
  onValueChange,
  onValidCnpj,
  submitError,
  ref,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const lastValid = useRef<string | null>(null);

  const masked = maskCnpj(value);
  const live = value.length === CNPJ_LENGTH ? validateCnpj(value) : "ok";
  const issue = submitError ?? (live === "ok" ? undefined : live);

  function accept(raw: string, caret: number): void {
    const next = normalizeCnpj(raw);
    pendingCaret.current = caretAfter(
      maskCnpj(next),
      normalizeCnpj(raw.slice(0, caret)).length,
    );
    onValueChange(next);
    if (
      next.length === CNPJ_LENGTH &&
      validateCnpj(next) === "ok" &&
      next !== lastValid.current
    ) {
      lastValid.current = next;
      onValidCnpj(next);
    }
  }

  // Put the caret back after the character just typed, not at the end.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (
      pendingCaret.current === null ||
      input === null ||
      input !== document.activeElement
    )
      return;
    input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [masked]);

  // Keystrokes typed before hydration live only in the DOM: adopt them once,
  // on mount (tech-design R3). Later changes arrive through onChange, so the
  // effect deliberately reads only the first render's value and handler.
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed !== "" && normalizeCnpj(typed) !== value)
      accept(typed, typed.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextField
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      name="cnpj"
      label={formCopy["form.cnpj.label"]}
      hint={formCopy["form.cnpj.hint"]}
      placeholder={formCopy["form.cnpj.placeholder"]}
      {...CNPJ_KEYBOARD}
      value={masked}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        accept(
          event.target.value,
          event.target.selectionStart ?? event.target.value.length,
        )
      }
      {...(issue !== undefined && { error: ERROR_COPY[issue] })}
    />
  );
}
