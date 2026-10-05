// Lote's parser worker (ADR-0012 item 1): a module worker created on the first
// file pick. T71 ships its plumbing only: it announces itself with the
// sentinel the bundle guard looks for (item 6). T75 wires sniff → read →
// analyze behind protocol.ts.

import type { WorkerReady } from "@/features/panel-lote/parser/protocol";

/** The bundle guard's marker: it must appear in this chunk and never in First Load JS. */
const SENTINEL = "kybr-lote-parser/1";

const ready: WorkerReady = { kind: "ready", version: SENTINEL };
self.postMessage(ready);
