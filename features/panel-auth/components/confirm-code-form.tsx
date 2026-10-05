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
import { LiveRegion } from "@/components/ui/live-region";
import { TextField } from "@/components/ui/text-field";
import {
  confirmEmailAction,
  resendCodeAction,
  type ConfirmResult,
  type ResendResult,
} from "@/features/panel-auth/actions";
import {
  NETWORK_ALERT,
  TURNSTILE_ALERT,
  rateLimitAlert,
} from "@/features/panel-auth/alerts";
import { ResendCountdown } from "@/features/panel-auth/components/resend-countdown";
import { Turnstile } from "@/features/panel-auth/components/turnstile";
import { confirmCopy } from "@/features/panel-auth/copy/confirm";
import { isCode, normalizeCode } from "@/features/panel-auth/validation";
import { fill } from "@/features/panel-shell/format";

type State = { alert: readonly string[]; navigating: boolean };
const IDLE: State = { alert: [], navigating: false };

type Props = {
  /** The address typed at sign-up (from the httpOnly sign-up cookie). */
  email: string;
  resendAvailableInMs: number;
  turnstileSiteKey: string;
  nonce: string | undefined;
};

/** S2: the 6-digit code, and "Reenviar código" behind a countdown and Turnstile. */
export function ConfirmCodeForm({
  email,
  resendAvailableInMs,
  turnstileSiteKey,
  nonce,
}: Props): JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [wait, setWait] = useState({ ms: resendAvailableInMs, key: 0 });
  const [resending, setResending] = useState(false);
  const [resendAlert, setResendAlert] = useState<readonly string[] | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  function failed(alert: readonly string[]): State {
    inFlight.current = false;
    field.current?.focus();
    return { alert, navigating: false };
  }

  async function send(_previous: State, codigo: string): Promise<State> {
    if (!isCode(codigo)) return failed([confirmCopy["confirm.error.wrong"]]);
    let result: ConfirmResult;
    try {
      result = await confirmEmailAction({ codigo });
    } catch {
      return failed(NETWORK_ALERT);
    }
    if (result.ok) {
      router.push(result.next);
      return { alert: [], navigating: true };
    }
    switch (result.code) {
      case "SEM_CADASTRO":
        router.push("/cadastro");
        return { alert: [], navigating: true };
      case "CODIGO_INCORRETO":
        return failed([confirmCopy["confirm.error.wrong"]]);
      case "CODIGO_EXPIRADO":
        return failed([confirmCopy["confirm.error.expired"]]);
      case "LIMITE_TENTATIVAS":
        return failed(rateLimitAlert(result.retryAfterSeconds));
      case "TURNSTILE_INVALIDO":
      case "NETWORK":
        return failed(NETWORK_ALERT);
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    setResendAlert(null);
    inFlight.current = true;
    startTransition(() => dispatch(code));
  }

  async function resend(): Promise<void> {
    setAnnouncement("");
    if (token === null) {
      setResendAlert(TURNSTILE_ALERT);
      return;
    }
    setResending(true);
    let result: ResendResult;
    try {
      result = await resendCodeAction({ turnstile: token });
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    setResending(false);
    setResetKey((key) => key + 1);
    if (result.ok) {
      setResendAlert([]);
      setAnnouncement(fill(confirmCopy["confirm.resent"], { email }));
      setWait((previous) => ({ ms: result.resendInMs, key: previous.key + 1 }));
      return;
    }
    if (result.code === "SEM_CADASTRO") {
      router.push("/cadastro");
      return;
    }
    setResendAlert(
      result.code === "LIMITE_TENTATIVAS"
        ? rateLimitAlert(result.retryAfterSeconds)
        : result.code === "TURNSTILE_INVALIDO"
          ? TURNSTILE_ALERT
          : NETWORK_ALERT,
    );
  }

  const alert = resendAlert ?? state.alert;
  return (
    <div className="flex flex-col gap-6">
      <form
        action={() => {}}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6"
      >
        <TextField
          ref={field}
          name="codigo"
          label={confirmCopy["confirm.label"]}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={16}
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
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
            busy={isPending || state.navigating}
            busyLabel={confirmCopy["confirm.submit.busy"]}
            className="w-full"
          >
            {confirmCopy["confirm.submit"]}
          </Button>
        </div>
      </form>
      <div className="flex flex-col gap-3">
        <Turnstile
          siteKey={turnstileSiteKey}
          nonce={nonce}
          resetKey={resetKey}
          onToken={setToken}
          onError={() => setResendAlert(TURNSTILE_ALERT)}
        />
        <ResendCountdown
          availableInMs={wait.ms}
          restartKey={wait.key}
          busy={resending}
          onResend={() => void resend()}
        />
        <LiveRegion className="text-secondary text-ink-muted">
          {announcement}
        </LiveRegion>
      </div>
    </div>
  );
}
