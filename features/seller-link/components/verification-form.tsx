"use client";

import { useRef, useState, type FormEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { TextField } from "@/components/ui/text-field";
import { lookupCompanyAction } from "@/features/seller-link/actions";
import { CnpjField } from "@/features/seller-link/components/cnpj-field";
import {
  CompanyBlock,
  type CompanyBlockState,
} from "@/features/seller-link/components/company-block";
import { formCopy } from "@/features/seller-link/copy/form";
import { fill } from "@/features/seller-link/format";
import { razaoSocialText } from "@/features/seller-link/razao-social";
import {
  RESPONSAVEL_MAX_LENGTH,
  filterResponsavel,
  verifySchema,
  type CnpjIssue,
  type ResponsavelIssue,
} from "@/features/seller-link/schemas";

type Lookup = CompanyBlockState & { cnpj?: string };

type FieldErrors = {
  cnpj?: CnpjIssue | undefined;
  responsavel?: ResponsavelIssue | undefined;
};

// `invalid` comes only from a tampered request (the field filters as typed),
// so it reuses the empty copy rather than needing a new string (F07).
const NAME_ERROR_COPY: Record<ResponsavelIssue, string> = {
  empty: formCopy["form.name.error.empty"],
  single: formCopy["form.name.error.single"],
  invalid: formCopy["form.name.error.empty"],
};

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

/** Narrows a schema issue message (a reason code) to the field's reason union. */
function reasonIn<T extends string>(
  allowed: readonly T[],
  message: string | undefined,
): T | undefined {
  return allowed.find((reason) => reason === message);
}

type Props = {
  slug: string;
};

/**
 * The verification form (client leaf): the CNPJ with its autofill, the
 * responsible person's name, and client-side validation on submit with the
 * schema the Server Action also uses. The submit itself is T18. The form's
 * function action keeps a pre-hydration submit inert, so it never falls back
 * to a GET with the CNPJ or name in the query string.
 */
export function VerificationForm({ slug }: Props): JSX.Element {
  const [cnpj, setCnpj] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const cnpjInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  // The CNPJ whose lookup is in flight; a response for any other is stale.
  const current = useRef<string | null>(null);

  function changeCnpj(next: string): void {
    setCnpj(next);
    setErrors((previous) => ({ ...previous, cnpj: undefined }));
    if (current.current !== null && next !== current.current) {
      current.current = null;
      setLookup({ status: "idle" });
    }
  }

  async function lookUp(target: string): Promise<void> {
    current.current = target;
    setLookup({ status: "loading", cnpj: target });
    setAnnouncement(formCopy["form.lookup.loading"]);

    let next: Lookup;
    try {
      const result = await lookupCompanyAction(slug, target);
      next = result.ok
        ? { status: "found", cnpj: target, company: result.company }
        : { status: result.reason, cnpj: target };
    } catch {
      // The action itself couldn't be reached (offline): the same note, no retry.
      next = { status: "failed", cnpj: target };
    }
    if (current.current !== target) return;

    setLookup(next);
    setAnnouncement(
      next.status === "found"
        ? fill(formCopy["form.lookup.found"], {
            razao_social: razaoSocialText(next.company.razaoSocial),
          })
        : formCopy[
            next.status === "not_found"
              ? "form.lookup.notfound"
              : "form.lookup.failed"
          ],
    );
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = verifySchema.safeParse({ cnpj, responsavel });
    if (!result.success) {
      const message = (field: keyof FieldErrors): string | undefined =>
        result.error.issues.find((candidate) => candidate.path[0] === field)
          ?.message;
      const next: FieldErrors = {
        cnpj: reasonIn(CNPJ_ISSUES, message("cnpj")),
        responsavel: reasonIn(RESPONSAVEL_ISSUES, message("responsavel")),
      };
      setErrors(next);
      // Focus the first invalid field, in visual order: CNPJ, then name (AC 11).
      (next.cnpj ? cnpjInput : nameInput).current?.focus();
      return;
    }
    setErrors({});
    // T18: start the verification with result.data.
  }

  return (
    <form
      action={() => {}}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-3">
        <CnpjField
          ref={cnpjInput}
          value={cnpj}
          onValueChange={changeCnpj}
          onValidCnpj={(target) => void lookUp(target)}
          submitError={errors.cnpj}
        />
        <CompanyBlock state={lookup} />
      </div>
      <TextField
        ref={nameInput}
        name="responsavel"
        label={formCopy["form.name.label"]}
        hint={formCopy["form.name.hint"]}
        autoComplete="name"
        maxLength={RESPONSAVEL_MAX_LENGTH}
        value={responsavel}
        onChange={(event) => {
          setResponsavel(filterResponsavel(event.target.value));
          setErrors((previous) => ({ ...previous, responsavel: undefined }));
        }}
        {...(errors.responsavel !== undefined && {
          error: NAME_ERROR_COPY[errors.responsavel],
        })}
      />
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
      <Button type="submit" className="w-full">
        {formCopy["form.submit"]}
      </Button>
    </form>
  );
}
