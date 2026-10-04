import { loginCopy } from "@/features/panel-auth/copy/login";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill, minutesFromSeconds } from "@/features/panel-shell/format";

// The form-level messages every auth form shares (spec v1.2 S1–S3).

export const NETWORK_ALERT: readonly string[] = [globalCopy["error.network"]];

/** Turnstile failed, or its script never loaded (the submit is the retry). */
export const TURNSTILE_ALERT: readonly string[] = [
  loginCopy["auth.error.turnstile"],
  loginCopy["auth.error.turnstile.hint"],
];

export function rateLimitAlert(
  retryAfterSeconds: number | undefined,
): readonly string[] {
  return [
    fill(loginCopy["auth.error.rate_limit"], {
      minutos: minutesFromSeconds(retryAfterSeconds),
    }),
  ];
}
