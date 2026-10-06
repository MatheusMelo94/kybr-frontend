"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { FilaAba } from "@/features/panel-fila/search-params";
import type { Collapse } from "@/features/panel-fila/use-collapse";
import { useOnline } from "@/features/panel-fila/use-online";
import { useRefreshUntil } from "@/lib/navigation/refresh-until";

// The Fila's layout-scoped client state (plan-m6 § 5), kept across the page
// remount of a case switch: the case being opened (the detail skeleton), the
// focus intent (the detail heading after an open) and the list's scroll per
// tab (T99), the optimistic removal of a case being decided and the intent
// Idempotency-Keys (F5, T105), the decide flashes, the offline hint and the
// re-read after a failed decision (T106), and the new-case snapshot (T110,
// D3): the ids Renata has been shown, the poll's desde and generation, and
// the notice's count; and the online state (T111, D8): the browser's, or
// offline after a decision's NETWORK until a poll gets through.

/** /fila's key for the pane (DetailPane's caseId null): case ids are never empty. */
export const FILA_NO_CASE = "";

/** A decision in flight (useOptimistic: it ends with the transition). */
type Removal = { id: string; next: string | null } | null;

/**
 * A decision's outcome shown on its case (plan-m6 § 3.3): decide-error
 * (a failure or an unknown outcome), conflict (a 409, decided elsewhere) or
 * requested (Pedir documento with no seller e-mail, D11: the action's link
 * until the case re-renders with its own).
 */
export type Flash =
  | { kind: "decide-error" }
  | { kind: "conflict"; decididoEm: string | undefined }
  | { kind: "requested"; link: string | undefined };

/** The list as rendered: its ids in order and its ?aba=&ate= (the next case, D5). */
type ListSnapshot = { ids: readonly string[]; query: string };

/**
 * D3: what Renata has been shown on Para decidir. A server render under the
 * same list (a revalidation, a case switch) hides any id outside it until
 * "Mostrar"; another list (a tab, "Carregar mais") is a fresh snapshot.
 * `gen` tags each poll (E4): a result for an older generation is dropped.
 */
type Shown = {
  query: string;
  ids: ReadonlySet<string>;
  desde: string;
  gen: number;
};

/** The list pane reports each render (CaseListbox). */
type ListRender = {
  aba: FilaAba;
  query: string;
  ids: readonly string[];
  /** The page's gerado_em (C-M6-1): the next poll's desde. */
  desde: string;
};

type FilaValue = {
  /** A case the user opened that hasn't rendered yet (DetailPane's skeleton). */
  pendingCaseId: string | null;
  /** The case whose heading takes focus when it renders. */
  focusIntent: string | null;
  /** Opening `id`: its skeleton until it renders, then focus on its heading. */
  openCase: (id: string) => void;
  /** Focus `id`'s heading (it is already open). */
  focusCase: (id: string) => void;
  /** The case rendered (pending and focus intent are done with). */
  settle: (what: "pending" | "focus") => void;
  /** The list's window scroll for a tab, kept until the list remounts once. */
  saveScroll: (aba: FilaAba, y: number) => void;
  takeScroll: (aba: FilaAba) => number | undefined;
  /** The case being decided (hidden from the list) and the next one (selected). */
  removal: Removal;
  /** Inside a transition: hide `id` and select `next` until it ends. */
  setRemoval: (removal: Removal) => void;
  /** CaseListbox reports what it rendered. */
  reportList: (snapshot: ListSnapshot) => void;
  list: () => ListSnapshot;
  /**
   * F5: one Idempotency-Key per intent (caseId, action, body), here in the
   * layout so the re-read remount after an unknown outcome keeps it.
   */
  intentKey: (intent: string) => string;
  /** After a definitive result (ok, 409, a 4xx) or a changed body. */
  releaseKey: (intent: string) => void;
  /** R1: the cases decided in this session, never a "next" case (a lagging list may still show them). */
  markDecided: (id: string) => void;
  wasDecided: (id: string) => boolean;
  /** T114: the list registers its collapse; a quick decision captures it before the removal. */
  /** Returns the unregister (a no-op once another list registered). */
  setCollapse: (collapse: Collapse) => () => void;
  captureCollapse: (leavingId: string) => void;
  /** The flash per case: until the case is opened again or decided. */
  flash: Readonly<Record<string, Flash>>;
  setFlash: (id: string, flash: Flash | null) => void;
  /** A decision's call didn't get through (NETWORK): offline until reachable(). */
  offlineHint: boolean;
  hintOffline: () => void;
  /** A poll got through: the NETWORK hint is over. */
  reachable: () => void;
  /** D8: online by the browser and with no NETWORK hint. */
  online: boolean;
  /** The layout's last server render (offline.panel's {hora}). */
  renderedAt: number;
  /** Re-read the current page until the server re-renders it (renderedAt). */
  reread: () => void;
  /** D3: the ids of a rendered list Renata may see (the open case always). */
  visibleIds: (
    query: string,
    ids: readonly string[],
    selectedId: string | null,
  ) => readonly string[];
  /** After a list render: keep the snapshot, or take a fresh one. */
  observeList: (render: ListRender) => void;
  /** The poll's input, or null when there is nothing to poll for. */
  pollTarget: () => { desde: string; gen: number } | null;
  /** A poll's count, applied only for the current generation (E4). */
  reportNovos: (novos: number, gen: number) => void;
  /** The notice's count (Para decidir only). */
  novos: number;
  /** "Mostrar": the notice clears, the page re-reads, the snapshot resets. */
  showNew: () => void;
};

const FilaContext = createContext<FilaValue | null>(null);

type Props = {
  /** The layout's render time: it changes when the server re-renders (a refresh). */
  renderedAt: number;
  children: ReactNode;
};

export function FilaProvider({ renderedAt, children }: Props): JSX.Element {
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const [focusIntent, setFocusIntent] = useState<string | null>(null);
  const scroll = useRef(new Map<FilaAba, number>());
  const [removal, setRemoval] = useOptimistic<Removal, Removal>(
    null,
    (_, next) => next,
  );
  const listRef = useRef<ListSnapshot>({ ids: [], query: "" });
  const keys = useRef(new Map<string, string>());
  const decided = useRef(new Set<string>());
  const [flash, setFlashes] = useState<Readonly<Record<string, Flash>>>({});
  const [offlineHint, setOfflineHint] = useState(false);
  const rendered = useRef(renderedAt);
  const rereadFrom = useRef(renderedAt);
  const [shown, setShown] = useState<Shown | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const gen = useRef(0);
  const [novos, setNovos] = useState(0);
  // "Mostrar" pressed at this render; the next server render resets.
  const [resetFrom, setResetFrom] = useState<number | null>(null);
  const resetDue = resetFrom !== null && resetFrom !== renderedAt;

  useEffect(() => {
    rendered.current = renderedAt;
    // A server render got through (the re-read after a NETWORK, T106):
    // the hint is over, like after a successful poll.
    setOfflineHint(false);
  }, [renderedAt]);

  const setFlash = useCallback((id: string, next: Flash | null) => {
    setFlashes((current) => {
      if (next !== null) return { ...current, [id]: next };
      if (!(id in current)) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
  }, []);
  const hintOffline = useCallback(() => setOfflineHint(true), []);
  const reachable = useCallback(() => setOfflineHint(false), []);
  const online = useOnline() && !offlineHint;
  const refreshUntilRendered = useRefreshUntil(
    useCallback(() => rendered.current !== rereadFrom.current, []),
  );
  const reread = useCallback(() => {
    // D8: offline, a refresh's failed RSC fetch falls back to a full load
    // (the browser's offline page). OfflineBanner re-reads on reconnect.
    if (!navigator.onLine) return;
    rereadFrom.current = rendered.current;
    refreshUntilRendered();
  }, [refreshUntilRendered]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  const visibleIds = useCallback(
    (query: string, ids: readonly string[], selectedId: string | null) => {
      if (shown === null || shown.query !== query || resetDue) return ids;
      return ids.filter((id) => shown.ids.has(id) || id === selectedId);
    },
    [shown, resetDue],
  );
  const observeList = useCallback(
    ({ aba, query, ids, desde }: ListRender) => {
      if (aba !== "aberto") {
        gen.current += 1;
        setShown(null);
        setNovos(0);
        return;
      }
      if (shown !== null && shown.query === query && !resetDue) return;
      gen.current += 1;
      setShown({ query, ids: new Set(ids), desde, gen: gen.current });
      setNovos(0);
      setResetFrom(null);
    },
    [shown, resetDue],
  );
  const pollTarget = useCallback(() => {
    const current = shownRef.current;
    return current === null || current.gen !== gen.current
      ? null
      : { desde: current.desde, gen: current.gen };
  }, []);
  const reportNovos = useCallback((count: number, at: number) => {
    if (at === gen.current) setNovos(count);
  }, []);
  const showNew = useCallback(() => {
    gen.current += 1;
    setNovos(0);
    setResetFrom(rendered.current);
    reread();
  }, [reread]);

  const openCase = useCallback(
    (id: string) => {
      setPendingCaseId(id);
      setFocusIntent(id);
      setFlash(id, null);
    },
    [setFlash],
  );
  const settle = useCallback((what: "pending" | "focus") => {
    if (what === "pending") setPendingCaseId(null);
    else setFocusIntent(null);
  }, []);
  const saveScroll = useCallback((aba: FilaAba, y: number) => {
    scroll.current.set(aba, y);
  }, []);
  const takeScroll = useCallback((aba: FilaAba) => {
    const y = scroll.current.get(aba);
    scroll.current.delete(aba);
    return y;
  }, []);

  const reportList = useCallback((snapshot: ListSnapshot) => {
    listRef.current = snapshot;
  }, []);
  const list = useCallback(() => listRef.current, []);
  const intentKey = useCallback((intent: string) => {
    let key = keys.current.get(intent);
    if (key === undefined) {
      key = crypto.randomUUID();
      keys.current.set(intent, key);
    }
    return key;
  }, []);
  const releaseKey = useCallback((intent: string) => {
    keys.current.delete(intent);
  }, []);

  const markDecided = useCallback((id: string) => {
    decided.current.add(id);
  }, []);
  const wasDecided = useCallback((id: string) => decided.current.has(id), []);

  const collapse = useRef<Collapse | null>(null);
  // The latest list to mount wins; an older one's cleanup (which can run
  // after the new page's list mounted) doesn't unregister it.
  const setCollapse = useCallback((next: Collapse) => {
    collapse.current = next;
    return () => {
      if (collapse.current === next) collapse.current = null;
    };
  }, []);
  const captureCollapse = useCallback((leavingId: string) => {
    collapse.current?.capture(leavingId);
  }, []);

  const value = useMemo<FilaValue>(
    () => ({
      pendingCaseId,
      focusIntent,
      openCase,
      focusCase: setFocusIntent,
      settle,
      saveScroll,
      takeScroll,
      removal,
      setRemoval,
      reportList,
      list,
      intentKey,
      releaseKey,
      markDecided,
      wasDecided,
      setCollapse,
      captureCollapse,
      flash,
      setFlash,
      offlineHint,
      hintOffline,
      reachable,
      online,
      renderedAt,
      reread,
      visibleIds,
      observeList,
      pollTarget,
      reportNovos,
      novos,
      showNew,
    }),
    [
      pendingCaseId,
      focusIntent,
      openCase,
      settle,
      saveScroll,
      takeScroll,
      removal,
      setRemoval,
      reportList,
      list,
      intentKey,
      releaseKey,
      markDecided,
      wasDecided,
      setCollapse,
      captureCollapse,
      flash,
      setFlash,
      offlineHint,
      hintOffline,
      reachable,
      online,
      renderedAt,
      reread,
      visibleIds,
      observeList,
      pollTarget,
      reportNovos,
      novos,
      showNew,
    ],
  );
  return <FilaContext.Provider value={value}>{children}</FilaContext.Provider>;
}

/** D8's online state; true outside the Fila (the tabs' tests, Lote). */
export function useFilaOnline(): boolean {
  return useContext(FilaContext)?.online ?? true;
}

/** The Fila's state; only inside fila/layout.tsx. */
export function useFila(): FilaValue {
  const value = useContext(FilaContext);
  if (value === null) throw new Error("useFila outside FilaProvider");
  return value;
}
