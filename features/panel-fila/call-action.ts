import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";

// F6: every write action call from the Fila is wrapped. A rejected call (a
// network failure, a middleware 404, a 500, deployment skew) and a call with
// no result within DECIDE_TIMEOUT_MS are both an unknown outcome: NETWORK,
// never an uncaught throw into fila/error.tsx and never "done".

export type NetworkResult = { ok: false; code: "NETWORK" };

const NETWORK: NetworkResult = { ok: false, code: "NETWORK" };

type Options<R> = {
  /** A result that arrives after the bound (Security, LOW): only for releasing a key. */
  onLate?: (result: R | NetworkResult) => void;
  timeoutMs?: number;
};

export function callAction<I, R>(
  action: (input: I) => Promise<R>,
  input: I,
  { onLate, timeoutMs = DECIDE_TIMEOUT_MS }: Options<R> = {},
): Promise<R | NetworkResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      resolve(NETWORK);
    }, timeoutMs);
    const settle = (result: R | NetworkResult): void => {
      if (timedOut) {
        onLate?.(result);
        return;
      }
      clearTimeout(timer);
      resolve(result);
    };
    let pending: Promise<R>;
    try {
      pending = action(input);
    } catch {
      settle(NETWORK);
      return;
    }
    pending.then(settle, () => settle(NETWORK));
  });
}
