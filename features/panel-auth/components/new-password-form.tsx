"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import {
  resetPasswordAction,
  type ResetPasswordResult,
} from "@/features/panel-auth/actions";
import { NETWORK_ALERT, rateLimitAlert } from "@/features/panel-auth/alerts";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import {
  PASSWORD_MIN_LENGTH,
  isNewPassword,
  isResetToken,
} from "@/features/panel-auth/validation";
import { fill } from "@/features/panel-shell/format";

const TOO_SHORT = fill(signupCopy["signup.error.password"], {
  n: PASSWORD_MIN_LENGTH,
});

/**
 * The token from `#t=…` (P04): read once, then dropped from the URL before
 * anything else happens, so it never sits in history, a bookmark or a
 * Referer. The server never sees it in a URL; it travels in the action body.
 */
function takeTokenFromFragment(): string | null {
  const match = /^#t=([^&]+)$/.exec(window.location.hash);
  if (window.location.hash !== "")
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  const token = match?.[1] ?? null;
  return token !== null && isResetToken(token) ? token : null;
}

type State = {
  fieldError: string | null;
  alert: readonly string[];
  expired: boolean;
  navigating: boolean;
};
const IDLE: State = {
  fieldError: null,
  alert: [],
  expired: false,
  navigating: false,
};

/** S3 Nova senha: one field; an expired, used or missing token offers "Pedir outro link". */
export function NewPasswordForm(): JSX.Element {
  const router = useRouter();
  // undefined until the fragment is read (the server render can't know it).
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [senha, setSenha] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  useLayoutEffect(() => {
    setToken(takeTokenFromFragment());
  }, []);

  function fieldError(text: string): State {
    inFlight.current = false;
    field.current?.focus();
    return { ...IDLE, fieldError: text };
  }

  async function send(
    _previous: State,
    payload: { token: string; senha: string },
  ): Promise<State> {
    if (!isNewPassword(payload.senha)) return fieldError(TOO_SHORT);
    let result: ResetPasswordResult;
    try {
      result = await resetPasswordAction(payload);
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    if (result.ok) {
      router.push("/entrar?motivo=senha-nova");
      return { ...IDLE, navigating: true };
    }
    inFlight.current = false;
    switch (result.code) {
      case "TOKEN_INVALIDO":
        return { ...IDLE, expired: true };
      case "SENHA_CURTA":
        return fieldError(TOO_SHORT);
      case "SENHA_FRACA":
        return fieldError(loginCopy["auth.error.password_breached"]);
      case "LIMITE_TENTATIVAS":
        return { ...IDLE, alert: rateLimitAlert(result.retryAfterSeconds) };
      case "TURNSTILE_INVALIDO":
      case "NETWORK":
        return { ...IDLE, alert: NETWORK_ALERT };
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);

  if (token === undefined) return <div className="min-h-40" />;
  if (token === null || state.expired) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-ink">{resetCopy["reset.error.expired"]}</p>
        <Link
          href="/senha/esqueci"
          className="inline-flex min-h-11 items-center text-secondary text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {resetCopy["reset.error.expired.cta"]}
        </Link>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current || token === null || token === undefined) return;
    inFlight.current = true;
    startTransition(() => dispatch({ token, senha }));
  }

  return (
    <form
      action={() => {}}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6"
    >
      <TextField
        ref={field}
        name="senha"
        type="password"
        autoComplete="new-password"
        label={resetCopy["reset.new.password.label"]}
        hint={fill(signupCopy["signup.password.hint"], {
          n: PASSWORD_MIN_LENGTH,
        })}
        maxLength={128}
        value={senha}
        onChange={(event) => setSenha(event.target.value)}
        {...(state.fieldError !== null && { error: state.fieldError })}
      />
      <div className="flex flex-col gap-3">
        <FormAlert>
          {state.alert.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </FormAlert>
        <Button
          type="submit"
          size="panel"
          busy={isPending || state.navigating}
          busyLabel={resetCopy["reset.new.submit.busy"]}
          className="w-full"
        >
          {resetCopy["reset.new.submit"]}
        </Button>
      </div>
    </form>
  );
}
