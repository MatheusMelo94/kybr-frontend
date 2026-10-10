"use client";

import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";

import { FormAlert } from "@/components/panel/form-alert";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { NETWORK_ALERT, rateLimitAlert } from "@/features/panel-auth/alerts";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/panel-auth/validation";
import {
  changePasswordAction,
  type ChangePasswordResult,
} from "@/features/panel-settings/actions";
import { settingsCopy } from "@/features/panel-settings/copy";
import { useDialogDraft } from "@/features/panel-shell/components/session-expiry-provider";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

type Props = {
  /** The login e-mail, for password managers (hidden, autocomplete="username"). */
  email: string;
};

type Errors = { atual?: string; nova?: string };

/**
 * The same Server Action as the form's action (O-F2: a POST before
 * hydration). React types a form action as returning void and ignores what
 * it returns, so only the type narrows; one action, one entry point.
 */
const asFormAction = changePasswordAction as (
  formData: FormData,
) => Promise<unknown> as (formData: FormData) => Promise<void>;

/** Retry-After missing: the minute the copy says (minutesFromSeconds). */
const DEFAULT_LOCK_SECONDS = 60;

/**
 * Security T136-02: the lock's timer never waits past an hour. A larger
 * Retry-After would overflow setTimeout (2^31 - 1 ms) and unlock at once;
 * the server still answers 429 if it's early.
 */
const MAX_LOCK_SECONDS = 3600;

const SHORT = fill(signupCopy["signup.error.password"], {
  n: PASSWORD_MIN_LENGTH,
});

/**
 * "Trocar senha" (S12, AC 60; Security O-F1..O-F3). The form's action is
 * the Server Action itself, so before hydration it's a POST (O-F2); once
 * hydrated the submit calls it with the form's FormData, once (never a
 * retry). The values live only in the two uncontrolled inputs: no state
 * copy, no storage, never in a toast or title. Success toasts and clears
 * both; an expiry discards both. SENHA_ATUAL_INCORRETA is a field error,
 * not an expiry (O-F1); a 429 disables the button until Retry-After.
 */
export function PasswordForm({ email }: Props): JSX.Element {
  const toast = useToast();
  const expire = useSessionExpiry();
  const atual = useRef<HTMLInputElement>(null);
  const nova = useRef<HTMLInputElement>(null);
  const unlock = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasInput, setHasInput] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  useDialogDraft(hasInput);

  useEffect(
    () => () => {
      if (unlock.current !== null) clearTimeout(unlock.current);
    },
    [],
  );

  /** The draft is only whether there's input, never the input (O-F2). */
  function noteInput(): void {
    setHasInput(
      [atual, nova].some((field) => (field.current?.value ?? "") !== ""),
    );
  }

  function lockFor(seconds: number): void {
    setLocked(true);
    if (unlock.current !== null) clearTimeout(unlock.current);
    const wait = Math.min(Math.max(seconds, 0), MAX_LOCK_SECONDS);
    unlock.current = setTimeout(() => setLocked(false), wait * 1000);
  }

  function fieldError(field: keyof Errors, message: string): void {
    setErrors({ [field]: message });
    (field === "atual" ? atual : nova).current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || locked) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const senhaAtual = data.get("senha_atual");
    const senhaNova = data.get("senha_nova");
    if (typeof senhaAtual !== "string" || senhaAtual.length === 0)
      return fieldError("atual", settingsCopy["pwd.error.current"]);
    if (typeof senhaNova !== "string" || senhaNova.length < PASSWORD_MIN_LENGTH)
      return fieldError("nova", SHORT);
    setErrors({});
    setAlert([]);
    setBusy(true);
    let result: ChangePasswordResult;
    try {
      result = await changePasswordAction(data);
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    setBusy(false);
    if (result.ok) {
      form.reset();
      setHasInput(false);
      toast.show(settingsCopy["toast.password_changed"]);
      return;
    }
    switch (result.code) {
      case "SESSAO_EXPIRADA":
        // perdido=1 says there was input; the values never come back.
        expire();
        form.reset();
        return;
      case "SENHA_ATUAL_INCORRETA":
        return fieldError("atual", settingsCopy["pwd.error.current"]);
      case "SENHA_CURTA":
        return fieldError("nova", SHORT);
      case "SENHA_FRACA":
        return fieldError("nova", loginCopy["auth.error.password_breached"]);
      case "LIMITE_TENTATIVAS":
        setAlert(rateLimitAlert(result.retryAfterSeconds));
        lockFor(result.retryAfterSeconds ?? DEFAULT_LOCK_SECONDS);
        return;
      case "VALOR_INVALIDO":
      case "NETWORK":
        setAlert(NETWORK_ALERT);
        return;
    }
  }

  return (
    <section
      aria-labelledby="settings-password-h"
      className="flex min-w-0 flex-col gap-4"
    >
      <h2 id="settings-password-h" className="text-h2 font-title text-ink">
        {settingsCopy["pwd.h"]}
      </h2>
      <form
        action={asFormAction}
        onSubmit={(event) => void submit(event)}
        onInput={noteInput}
        noValidate
        className="flex min-w-0 flex-col gap-4"
      >
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <TextField
          ref={atual}
          name="senha_atual"
          type="password"
          autoComplete="current-password"
          label={settingsCopy["pwd.current"]}
          maxLength={PASSWORD_MAX_LENGTH}
          {...(errors.atual !== undefined && { error: errors.atual })}
        />
        <TextField
          ref={nova}
          name="senha_nova"
          type="password"
          autoComplete="new-password"
          label={settingsCopy["pwd.new"]}
          hint={fill(signupCopy["signup.password.hint"], {
            n: PASSWORD_MIN_LENGTH,
          })}
          maxLength={PASSWORD_MAX_LENGTH}
          {...(errors.nova !== undefined && { error: errors.nova })}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button type="submit" size="panel" busy={busy} disabled={locked}>
            {settingsCopy["pwd.submit"]}
          </Button>
          <FormAlert className="min-w-0">
            {alert.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </FormAlert>
        </div>
      </form>
    </section>
  );
}
