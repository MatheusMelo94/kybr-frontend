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
import { FormAlert } from "@/components/panel/form-alert";
import { TextField } from "@/components/ui/text-field";
import { loginAction, type LoginResult } from "@/features/panel-auth/actions";
import {
  NETWORK_ALERT,
  TURNSTILE_ALERT,
  rateLimitAlert,
} from "@/features/panel-auth/alerts";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { Turnstile } from "@/features/panel-auth/components/turnstile";

type Payload =
  | { email: string; senha: string; turnstile?: string; volta?: string }
  | "empty";

type State = { alert: readonly string[]; navigating: boolean };

const IDLE: State = { alert: [], navigating: false };
type Props = {
  /** The validated `volta` (the action re-validates it). */
  volta: string | null;
  turnstileSiteKey: string;
  nonce: string | undefined;
};

/** S3 Entrar: e-mail, password, and Turnstile once the API asks for it. */
export function LoginForm({
  volta,
  turnstileSiteKey,
  nonce,
}: Props): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [needsCheck, setNeedsCheck] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [widgetAlert, setWidgetAlert] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  // Set synchronously, so a double tap can't dispatch twice.
  const inFlight = useRef(false);

  function credentialsError(): State {
    emailInput.current?.focus();
    return { alert: [loginCopy["login.error.credentials"]], navigating: false };
  }

  async function send(_previous: State, payload: Payload): Promise<State> {
    // Nothing to check: the same one message, no request (it names no field).
    if (payload === "empty") return credentialsError();
    let result: LoginResult;
    try {
      result = await loginAction(payload);
    } catch {
      inFlight.current = false;
      return { alert: NETWORK_ALERT, navigating: false };
    }
    if (result.ok || result.code === "EMAIL_NAO_CONFIRMADO") {
      router.push(result.next);
      return { alert: [], navigating: true };
    }
    inFlight.current = false;
    // A token is single-use: reset the widget after every attempt.
    if (needsCheck) setResetKey((key) => key + 1);
    switch (result.code) {
      case "CREDENCIAIS_INVALIDAS":
        return credentialsError();
      case "TURNSTILE_REQUERIDO":
        setNeedsCheck(true);
        return {
          alert: [loginCopy["login.error.turnstile_required"]],
          navigating: false,
        };
      case "TURNSTILE_INVALIDO":
        return { alert: TURNSTILE_ALERT, navigating: false };
      case "LIMITE_TENTATIVAS":
        return {
          alert: rateLimitAlert(result.retryAfterSeconds),
          navigating: false,
        };
      case "NETWORK":
        return { alert: NETWORK_ALERT, navigating: false };
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);
  const busy = isPending || state.navigating;
  const alert = widgetAlert ? TURNSTILE_ALERT : state.alert;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    setWidgetAlert(false);
    if (email.trim() === "" || senha === "") {
      startTransition(() => dispatch("empty"));
      return;
    }
    inFlight.current = true;
    const payload: Exclude<Payload, "empty"> = {
      email,
      senha,
      ...(token !== null && { turnstile: token }),
      ...(volta !== null && { volta }),
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
      <TextField
        ref={emailInput}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        label={loginCopy["login.email.label"]}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        name="senha"
        type="password"
        autoComplete="current-password"
        label={loginCopy["login.password.label"]}
        value={senha}
        onChange={(event) => setSenha(event.target.value)}
      />
      {needsCheck && (
        <Turnstile
          siteKey={turnstileSiteKey}
          nonce={nonce}
          resetKey={resetKey}
          onToken={setToken}
          onError={() => setWidgetAlert(true)}
        />
      )}
      <div className="flex flex-col gap-3">
        <FormAlert>
          {alert.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </FormAlert>
        <Button
          type="submit"
          size="panel"
          busy={busy}
          busyLabel={loginCopy["login.submit.busy"]}
          className="w-full"
        >
          {loginCopy["login.submit"]}
        </Button>
      </div>
    </form>
  );
}
