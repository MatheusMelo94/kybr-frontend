// The messages between useBatchFile() and parser.worker.ts (ADR-0012 item 1,
// Security C8). Plain data only; the page re-checks every message's shape
// with plain functions (no zod in the client graph, ADR-0010 rule 8).
//
// The worker's ready message carries the sentinel "kybr-lote-parser/1"; the
// string itself lives only in parser.worker.ts, so the bundle guard can tell
// the worker chunk from First Load JS (ADR-0012 item 6).

/** The worker's first message, once its module has loaded. */
export type WorkerReady = { kind: "ready"; version: string };

export function isWorkerReady(message: unknown): message is WorkerReady {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "ready" &&
    typeof (message as { version?: unknown }).version === "string"
  );
}
