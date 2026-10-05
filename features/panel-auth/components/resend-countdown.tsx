"use client";

import { useEffect, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { confirmCopy } from "@/features/panel-auth/copy/confirm";
import { fill } from "@/features/panel-shell/format";

type Props = {
  /** Milliseconds until a resend is allowed (the API's reenviar_em). */
  availableInMs: number;
  /** Change it to start a new wait (after a resend). */
  restartKey: number;
  onResend: () => void;
  busy: boolean;
};

/** "Reenviar código", disabled with a seconds countdown until it's allowed (AC 3). */
export function ResendCountdown({
  availableInMs,
  restartKey,
  onResend,
  busy,
}: Props): JSX.Element {
  const [seconds, setSeconds] = useState(Math.ceil(availableInMs / 1000));

  useEffect(() => {
    const until = Date.now() + availableInMs;
    const tick = (): void =>
      setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [availableInMs, restartKey]);

  const waiting = seconds > 0;
  return (
    <Button
      variant="secondary"
      size="panel"
      disabled={waiting}
      busy={busy}
      busyLabel={confirmCopy["confirm.resend"]}
      onClick={onResend}
      className="w-full"
    >
      {waiting
        ? fill(confirmCopy["confirm.resend.wait"], { segundos: seconds })
        : confirmCopy["confirm.resend"]}
    </Button>
  );
}
