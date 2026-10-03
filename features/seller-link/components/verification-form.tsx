"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { TextField } from "@/components/ui/text-field";
import {
  lookupCompanyAction,
  startVerification,
  type StartVerificationResult,
} from "@/features/seller-link/actions";
import { CnpjField } from "@/features/seller-link/components/cnpj-field";
import {
  CompanyBlock,
  type CompanyBlockState,
} from "@/features/seller-link/components/company-block";
import { formCopy } from "@/features/seller-link/copy/form";
import { fill, minutosFromSeconds } from "@/features/seller-link/format";
import { razaoSocialText } from "@/features/seller-link/razao-social";
import {
  RESPONSAVEL_MAX_LENGTH,
  fieldIssues,
  filterResponsavel,
  verifySchema,
  type FieldIssues,
  type Passthrough,
  type ResponsavelIssue,
} from "@/features/seller-link/schemas";

type Lookup = CompanyBlockState & { cnpj?: string };

// `invalid` comes only from a tampered request (the field filters as typed),
// so it reuses the empty copy rather than needing a new string (F07).
const NAME_ERROR_COPY: Record<ResponsavelIssue, string> = {
  empty: formCopy["form.name.error.empty"],
  single: formCopy["form.name.error.single"],
  invalid: formCopy["form.name.error.empty"],
};

type SubmitPayload = {
  slug: string;
  idempotencyKey: string;
  cnpj: string;
  responsavel: string;
  ref?: string | undefined;
  ext_id?: string | undefined;
};

type SubmitState =
  | { status: "idle" }
  | { status: "redirecting" }
  | { status: "alert"; message: string };

const NETWORK_ALERT: SubmitState = {
  status: "alert",
  message: formCopy["form.submit.error.network"],
};

type Props = {
  slug: string;
  /** The link's validated ?ref= and ?ext_id=, passed through to D3 untouched. */
  passthrough?: Passthrough;
};

/**
 * The verification form (client leaf): the CNPJ with its autofill, the
 * responsible person's name, validation on submit with the schema the Server
 * Action also uses, then startVerification through useActionState. The form's
 * function action keeps a pre-hydration submit inert, so it never falls back
 * to a GET with the CNPJ or name in the query string.
 */
export function VerificationForm({ slug, passthrough }: Props): JSX.Element {
  const router = useRouter();
  const [cnpj, setCnpj] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [errors, setErrors] = useState<FieldIssues>({});
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const cnpjInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  // The CNPJ whose lookup is in flight; a response for any other is stale.
  const current = useRef<string | null>(null);
  // F17: one UUID per submit attempt, reused on retry while the inputs are
  // unchanged, so a lost response can't create a second case.
  const idempotencyKey = useRef<string | null>(null);
  // Set synchronously, so a double tap can't dispatch twice before re-render.
  const inFlight = useRef(false);

  function showFieldErrors(next: FieldIssues): void {
    setErrors(next);
    // Focus the first invalid field, in visual order: CNPJ, then name (AC 11).
    (next.cnpj ? cnpjInput : nameInput).current?.focus();
  }

  async function send(
    _previous: SubmitState,
    payload: SubmitPayload,
  ): Promise<SubmitState> {
    let result: StartVerificationResult;
    try {
      result = await startVerification(payload);
    } catch {
      // The action couldn't be reached (offline): values stay, and tapping
      // again retries with the same key (AC 13).
      inFlight.current = false;
      return NETWORK_ALERT;
    }
    if (result.ok) {
      router.push(`/v/${slug}/c/${result.token}`);
      return { status: "redirecting" };
    }
    inFlight.current = false;
    switch (result.reason) {
      case "invalid":
        showFieldErrors(result.fields);
        return { status: "idle" };
      case "link_not_found":
        // The action dropped the link's cached info; re-render as Link not found.
        router.refresh();
        return { status: "idle" };
      case "limit_cnpj":
      case "limit_generic":
        return {
          status: "alert",
          message: fill(
            formCopy[
              result.reason === "limit_cnpj"
                ? "form.submit.error.limit_cnpj"
                : "form.submit.error.limit_generic"
            ],
            { minutos: minutosFromSeconds(result.retryAfterSeconds ?? 60) },
          ),
        };
      case "failed":
        // Unknown codes and 5xx use the network copy (plan § 1.5).
        return NETWORK_ALERT;
    }
  }

  const [submitState, dispatch, isPending] = useActionState(send, {
    status: "idle",
  });
  const busy = isPending || submitState.status === "redirecting";

  function clearError(field: keyof FieldIssues): void {
    setErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  function inputChanged(): void {
    idempotencyKey.current = null;
  }

  function changeCnpj(next: string): void {
    setCnpj(next);
    inputChanged();
    clearError("cnpj");
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
    if (inFlight.current) return;

    const result = verifySchema.safeParse({ cnpj, responsavel });
    if (!result.success) {
      showFieldErrors(fieldIssues(result.error.issues));
      return;
    }
    setErrors({});
    inFlight.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    const payload: SubmitPayload = {
      slug,
      idempotencyKey: idempotencyKey.current,
      cnpj: result.data.cnpj,
      responsavel: result.data.responsavel,
      ...passthrough,
    };
    startTransition(() => dispatch(payload));
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
          inputChanged();
          clearError("responsavel");
        }}
        {...(errors.responsavel !== undefined && {
          error: NAME_ERROR_COPY[errors.responsavel],
        })}
      />
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
      <div className="flex flex-col gap-3">
        <LiveRegion
          politeness="alert"
          className="text-secondary text-danger-ink"
        >
          {submitState.status === "alert" ? submitState.message : ""}
        </LiveRegion>
        <Button
          type="submit"
          busy={busy}
          busyLabel={formCopy["form.submit.busy"]}
          className="w-full"
        >
          {formCopy["form.submit"]}
        </Button>
      </div>
    </form>
  );
}
