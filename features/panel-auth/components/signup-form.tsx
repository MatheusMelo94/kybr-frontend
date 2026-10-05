"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/panel/checkbox";
import { FormAlert } from "@/components/panel/form-alert";
import { TextField } from "@/components/ui/text-field";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { signupAction, type SignupResult } from "@/features/panel-auth/actions";
import {
  NETWORK_ALERT,
  TURNSTILE_ALERT,
  rateLimitAlert,
} from "@/features/panel-auth/alerts";
import { Turnstile } from "@/features/panel-auth/components/turnstile";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import {
  PASSWORD_MIN_LENGTH,
  SIGNUP_FIELDS,
  signupFieldIssues,
  type SignupField,
} from "@/features/panel-auth/validation";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fillNodes } from "@/features/panel-shell/fill-node";
import { fill } from "@/features/panel-shell/format";

type Values = {
  nome: string;
  workspace: string;
  email: string;
  senha: string;
  aceite: boolean;
};
type Errors = Partial<Record<SignupField, string>>;

const FIELD_ERRORS: Record<SignupField, string> = {
  nome: signupCopy["signup.error.name"],
  workspace: signupCopy["signup.error.workspace"],
  email: signupCopy["signup.error.email"],
  senha: fill(signupCopy["signup.error.password"], { n: PASSWORD_MIN_LENGTH }),
  aceite: signupCopy["signup.error.terms"],
};
const LINK_CLASS =
  "text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type State = { alert: ReactNode; navigating: boolean };
const IDLE: State = { alert: null, navigating: false };

function lines(texts: readonly string[]): ReactNode {
  return texts.map((text) => <p key={text}>{text}</p>);
}

/** A legal page in a new tab: the URL is server config (https:, or loopback in local builds). */
function LegalLink({
  href,
  children,
}: {
  href: string;
  children: string;
}): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children} <VisuallyHidden>{globalCopy["common.new_tab"]}</VisuallyHidden>
    </a>
  );
}

type Props = {
  termsUrl: string;
  privacyUrl: string;
  turnstileSiteKey: string;
  nonce: string | undefined;
  /** "Contratar direto" (O-23): only when the address is configured. */
  commercialEmail: string | undefined;
  /** From the pending sign-up ("E-mail errado? Voltar"), never with the password. */
  prefill: { nome: string; workspace: string; email: string } | null;
};

/** S1 Cadastro: the four fields, the terms, Turnstile, signupAction. */
export function SignupForm({
  termsUrl,
  privacyUrl,
  turnstileSiteKey,
  nonce,
  commercialEmail,
  prefill,
}: Props): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    nome: prefill?.nome ?? "",
    workspace: prefill?.workspace ?? "",
    email: prefill?.email ?? "",
    senha: "",
    aceite: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [widgetAlert, setWidgetAlert] = useState(false);
  const refs = {
    nome: useRef<HTMLInputElement>(null),
    workspace: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    senha: useRef<HTMLInputElement>(null),
    aceite: useRef<HTMLInputElement>(null),
  };
  // One key per attempt, reused while the values stay the same (A-X7).
  const idempotencyKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  function showErrors(next: Errors): void {
    setErrors(next);
    const first = SIGNUP_FIELDS.find((field) => next[field] !== undefined);
    if (first) refs[first].current?.focus();
  }

  function change<K extends keyof Values>(field: K, value: Values[K]): void {
    setValues((previous) => ({ ...previous, [field]: value }));
    idempotencyKey.current = null;
    setErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  function issuesOf(candidate: Values): Errors {
    return Object.fromEntries(
      signupFieldIssues(candidate).map((field) => [field, FIELD_ERRORS[field]]),
    );
  }

  function blur(field: SignupField): void {
    const issue = issuesOf(values)[field];
    if (issue !== undefined)
      setErrors((previous) => ({ ...previous, [field]: issue }));
  }

  async function send(
    _previous: State,
    payload: Record<string, unknown>,
  ): Promise<State> {
    let result: SignupResult;
    try {
      result = await signupAction(payload);
    } catch {
      inFlight.current = false;
      return { alert: lines(NETWORK_ALERT), navigating: false };
    }
    if (result.ok) {
      router.push("/cadastro/confirmar");
      return { alert: null, navigating: true };
    }
    inFlight.current = false;
    // The token was spent: a fresh challenge for the retry.
    setResetKey((key) => key + 1);
    switch (result.code) {
      case "INVALID":
        showErrors(
          Object.fromEntries(
            result.fields.map((field) => [field, FIELD_ERRORS[field]]),
          ),
        );
        return IDLE;
      case "SENHA_FRACA":
        showErrors({ senha: loginCopy["auth.error.password_breached"] });
        return IDLE;
      case "EMAIL_EM_USO":
        return {
          alert: (
            <p className="flex flex-col gap-1">
              <span>{signupCopy["signup.error.email_taken"]}</span>
              <span className="flex gap-4">
                <Link href="/entrar" className={LINK_CLASS}>
                  {loginCopy["login.submit"]}
                </Link>
                <Link href="/senha/esqueci" className={LINK_CLASS}>
                  {resetCopy["reset.h1"]}
                </Link>
              </span>
            </p>
          ),
          navigating: false,
        };
      case "TESTE_INDISPONIVEL":
        return {
          alert: lines([
            signupCopy["signup.error.trial_unavailable"],
            ...(commercialEmail !== undefined
              ? [
                  fill(signupCopy["signup.error.trial_unavailable.contact"], {
                    email_comercial: commercialEmail,
                  }),
                ]
              : []),
          ]),
          navigating: false,
        };
      case "TESTE_PAUSADO":
        return {
          alert: lines([signupCopy["signup.error.trial_paused"]]),
          navigating: false,
        };
      case "TURNSTILE_INVALIDO":
        return { alert: lines(TURNSTILE_ALERT), navigating: false };
      case "LIMITE_TENTATIVAS":
        return {
          alert: lines(rateLimitAlert(result.retryAfterSeconds)),
          navigating: false,
        };
      case "NETWORK":
        return { alert: lines(NETWORK_ALERT), navigating: false };
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);
  const busy = isPending || state.navigating;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    setWidgetAlert(false);
    const issues = issuesOf(values);
    if (Object.keys(issues).length > 0) {
      showErrors(issues);
      return;
    }
    // No token (the widget failed, or its script never loaded): say so.
    if (token === null) {
      setWidgetAlert(true);
      return;
    }
    inFlight.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    const payload = {
      ...values,
      turnstile: token,
      idempotencyKey: idempotencyKey.current,
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
        ref={refs.nome}
        name="nome"
        label={signupCopy["signup.name.label"]}
        autoComplete="name"
        maxLength={120}
        value={values.nome}
        onChange={(event) => change("nome", event.target.value)}
        onBlur={() => blur("nome")}
        {...(errors.nome !== undefined && { error: errors.nome })}
      />
      <TextField
        ref={refs.workspace}
        name="workspace"
        label={signupCopy["signup.workspace.label"]}
        hint={signupCopy["signup.workspace.hint"]}
        autoComplete="organization"
        maxLength={80}
        value={values.workspace}
        onChange={(event) => change("workspace", event.target.value)}
        onBlur={() => blur("workspace")}
        {...(errors.workspace !== undefined && { error: errors.workspace })}
      />
      <TextField
        ref={refs.email}
        name="email"
        type="email"
        inputMode="email"
        label={signupCopy["signup.email.label"]}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        value={values.email}
        onChange={(event) => change("email", event.target.value)}
        onBlur={() => blur("email")}
        {...(errors.email !== undefined && { error: errors.email })}
      />
      <TextField
        ref={refs.senha}
        name="senha"
        type="password"
        label={signupCopy["signup.password.label"]}
        hint={fill(signupCopy["signup.password.hint"], {
          n: PASSWORD_MIN_LENGTH,
        })}
        autoComplete="new-password"
        maxLength={128}
        value={values.senha}
        onChange={(event) => change("senha", event.target.value)}
        onBlur={() => blur("senha")}
        {...(errors.senha !== undefined && { error: errors.senha })}
      />
      <Checkbox
        ref={refs.aceite}
        name="aceite"
        checked={values.aceite}
        onChange={(checked) => change("aceite", checked)}
        error={errors.aceite}
        label={fillNodes(signupCopy["signup.terms"], {
          termos: (
            <LegalLink href={termsUrl}>
              {signupCopy["signup.terms.link_terms"]}
            </LegalLink>
          ),
          privacidade: (
            <LegalLink href={privacyUrl}>
              {signupCopy["signup.terms.link_privacy"]}
            </LegalLink>
          ),
        })}
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
          {widgetAlert ? lines(TURNSTILE_ALERT) : state.alert}
        </FormAlert>
        <Button
          type="submit"
          size="panel"
          busy={busy}
          busyLabel={signupCopy["signup.submit.busy"]}
          className="w-full"
        >
          {signupCopy["signup.submit"]}
        </Button>
      </div>
    </form>
  );
}
