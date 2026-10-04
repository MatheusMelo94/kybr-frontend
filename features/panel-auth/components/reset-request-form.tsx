"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/panel/form-alert";
import { Notice } from "@/components/panel/notice";
import { TextField } from "@/components/ui/text-field";
import {
  requestPasswordResetAction,
  type ResetRequestResult,
} from "@/features/panel-auth/actions";
import {
  NETWORK_ALERT,
  TURNSTILE_ALERT,
  rateLimitAlert,
} from "@/features/panel-auth/alerts";
import { Turnstile } from "@/features/panel-auth/components/turnstile";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import { isEmail } from "@/features/panel-auth/validation";
import { fill } from "@/features/panel-shell/format";

/** P04: the reset link lives 1 h (reset.sent's {horas}). */
const RESET_LINK_HOURS = 1;

type State = { alert: readonly string[]; sentTo: string | null };
const IDLE: State = { alert: [], sentTo: null };

type Props = {
  turnstileSiteKey: string;
  nonce: string | undefined;
};

/** S3 Recuperar senha: the address, Turnstile, and the same answer for any address (AC 6). */
export function ResetRequestForm({
  turnstileSiteKey,
  nonce,
}: Props): JSX.Element {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [widgetAlert, setWidgetAlert] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  async function send(
    _previous: State,
    payload: { email: string; turnstile: string },
  ): Promise<State> {
    let result: ResetRequestResult;
    try {
      result = await requestPasswordResetAction(payload);
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    inFlight.current = false;
    setResetKey((key) => key + 1);
    if (result.ok) return { alert: [], sentTo: payload.email.trim() };
    switch (result.code) {
      case "LIMITE_TENTATIVAS":
        return {
          alert: rateLimitAlert(result.retryAfterSeconds),
          sentTo: null,
        };
      case "TURNSTILE_INVALIDO":
        return { alert: TURNSTILE_ALERT, sentTo: null };
      case "NETWORK":
        return { alert: NETWORK_ALERT, sentTo: null };
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);
  // A status mounted just now isn't announced reliably: move focus to it.
  const sent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.sentTo !== null) sent.current?.focus();
  }, [state.sentTo]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    setWidgetAlert(false);
    if (!isEmail(email)) {
      setEmailError(true);
      field.current?.focus();
      return;
    }
    if (token === null) {
      setWidgetAlert(true);
      return;
    }
    inFlight.current = true;
    startTransition(() => dispatch({ email, turnstile: token }));
  }

  const alert = widgetAlert ? TURNSTILE_ALERT : state.alert;
  return (
    <form
      action={() => {}}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6"
    >
      {state.sentTo !== null && (
        <Notice ref={sent} focusable>
          {fill(resetCopy["reset.sent"], {
            email: state.sentTo,
            horas: RESET_LINK_HOURS,
          })}
        </Notice>
      )}
      <TextField
        ref={field}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        label={loginCopy["login.email.label"]}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setEmailError(false);
        }}
        {...(emailError && { error: signupCopy["signup.error.email"] })}
      />
      <Turnstile
        siteKey={turnstileSiteKey}
        nonce={nonce}
        resetKey={resetKey}
        onToken={setToken}
        onError={() => setWidgetAlert(true)}
      />
      <div className="flex flex-col gap-3">
        <FormAlert>
          {alert.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </FormAlert>
        <Button
          type="submit"
          size="panel"
          busy={isPending}
          busyLabel={resetCopy["reset.submit.busy"]}
          className="w-full"
        >
          {resetCopy["reset.submit"]}
        </Button>
      </div>
    </form>
  );
}
