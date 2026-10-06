"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isParseFailure,
  isPayload,
  isPreview,
  isWorkerReady,
  type ParseError,
  type Preview,
} from "@/features/panel-lote/parser/protocol";
import type { BatchLinha } from "@/lib/panel-api-values";

/** ADR-0012 item 1: no answer in 20 s → unreadable, and the worker ends. */
export const WORKER_TIMEOUT_MS = 20_000;

export type BatchFileState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "error"; error: ParseError }
  | { status: "preview"; preview: Preview };

type Waiting = {
  kind: "parse" | "build";
  resolve?: (linhas: BatchLinha[] | undefined) => void;
};

/**
 * The parser worker's owner (ADR-0012 item 1, Security C8): created on the
 * first parse (never on mount), ended on reset(), on unmount, after build,
 * on any error and after 20 s without an answer. A second file while one is
 * parsing ends the first worker, so its late answer is never seen. Messages
 * are re-checked with plain functions (no zod, ADR-0010 rule 8). Nothing is
 * logged, and no file content is kept here beyond the preview.
 */
export function useBatchFile(): {
  state: BatchFileState;
  parse: (file: File) => void;
  build: (column: number) => Promise<BatchLinha[] | undefined>;
  reset: () => void;
} {
  const [state, setState] = useState<BatchFileState>({ status: "idle" });
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<Waiting | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    worker.current?.terminate();
    worker.current = null;
    const pending = waiting.current;
    waiting.current = null;
    pending?.resolve?.(undefined);
  }, []);

  const fail = useCallback(
    (error: ParseError) => {
      stop();
      setState({ status: "error", error });
    },
    [stop],
  );

  const wait = useCallback(
    (next: Waiting) => {
      waiting.current = next;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => fail("unreadable"), WORKER_TIMEOUT_MS);
    },
    [fail],
  );

  const onAnswer = useCallback(
    (data: unknown) => {
      if (isWorkerReady(data)) return;
      const pending = waiting.current;
      if (pending === null) return;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      waiting.current = null;
      if (pending.kind === "parse" && isPreview(data)) {
        setState({ status: "preview", preview: data });
        return;
      }
      if (pending.kind === "parse" && isParseFailure(data)) {
        fail(data.error);
        return;
      }
      if (pending.kind === "build" && isPayload(data)) {
        const resolve = pending.resolve;
        stop();
        resolve?.(data.linhas);
        return;
      }
      fail("unreadable");
    },
    [fail, stop],
  );

  const parse = useCallback(
    (file: File) => {
      stop();
      const created = new Worker(
        new URL("./parser/parser.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = created;
      // Only this worker's answers count (a cancelled one's are dropped).
      created.onmessage = (event: MessageEvent<unknown>) => {
        if (worker.current === created) onAnswer(event.data);
      };
      // The event's message can quote the file: it's never read (C8).
      created.onerror = () => {
        if (worker.current === created) fail("unreadable");
      };
      created.onmessageerror = () => {
        if (worker.current === created) fail("unreadable");
      };
      setState({ status: "reading" });
      wait({ kind: "parse" });
      created.postMessage({ kind: "parse", file });
    },
    [fail, onAnswer, stop, wait],
  );

  const build = useCallback(
    (column: number): Promise<BatchLinha[] | undefined> => {
      const current = worker.current;
      if (current === null || state.status !== "preview")
        return Promise.resolve(undefined);
      return new Promise((resolve) => {
        wait({ kind: "build", resolve });
        current.postMessage({ kind: "build", column });
      });
    },
    [state.status, wait],
  );

  const reset = useCallback(() => {
    stop();
    setState({ status: "idle" });
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { state, parse, build, reset };
}
