// Lote's parser worker (ADR-0012 item 1): a module worker created on the first
// file pick. It announces itself with the sentinel the bundle guard looks for
// (item 6), then answers parse / build through handler.ts. Nothing here logs.

import { createParserHandler } from "@/features/panel-lote/parser/handler";
import type { WorkerMessage } from "@/features/panel-lote/parser/protocol";

/** The bundle guard's marker: it must appear in this chunk and never in First Load JS. */
const SENTINEL = "kybr-lote-parser/1";

const post = (message: WorkerMessage): void => self.postMessage(message);
const handle = createParserHandler(post);

self.onmessage = (event: MessageEvent<unknown>) => {
  void handle(event.data);
};
post({ kind: "ready", version: SENTINEL });
