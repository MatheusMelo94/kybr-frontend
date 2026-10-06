"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";

// The shell's polled projection (plan § 3.1): counts and plan, seeded by the
// server's /me and refreshed by ShellStatusPoller. Scoped to the (app)
// layout (ADR-0010 rule 4). It never holds a copy of a list.

type Status = { contagens: Contagens | undefined; plano: Plano | undefined };

type Value = Status & {
  /** contagens.lote_em_andamento: the Lote item's nav.lote.running (S5). */
  loteRunning: boolean;
  update: (next: Status) => void;
  /** Lote (T80/T81): sets lote_em_andamento without waiting for the poll. */
  setLoteRunning: (running: boolean) => void;
  /** Asks ShellStatusPoller for a poll now (a batch ended: the plan moved). */
  pollNow: () => void;
  /** How many times pollNow() was called (the poller's trigger). */
  pollRequests: number;
  /** The Fila's decisions (plan-m6 § 3.3): no poll while one is in flight. Nests. */
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
};

const ShellStatusContext = createContext<Value | null>(null);

type Props = {
  initial: Status;
  children: ReactNode;
};

export function ShellStatusProvider({ initial, children }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>(initial);
  const [pollRequests, setPollRequests] = useState(0);
  const pauses = useRef(0);
  // A server render (a router.refresh(), a revalidated action) brings a fresh
  // /me: take it, so the counts and the plan never wait for the next poll.
  const snapshot = JSON.stringify(initial);
  useEffect(() => {
    setStatus(JSON.parse(snapshot) as Status);
  }, [snapshot]);
  const value = useMemo<Value>(
    () => ({
      ...status,
      loteRunning: status.contagens?.lote_em_andamento ?? false,
      update: setStatus,
      setLoteRunning: (running) =>
        setStatus((current) =>
          current.contagens === undefined
            ? current
            : {
                ...current,
                contagens: { ...current.contagens, lote_em_andamento: running },
              },
        ),
      pollNow: () => setPollRequests((count) => count + 1),
      pollRequests,
      pause: () => {
        pauses.current += 1;
      },
      resume: () => {
        pauses.current = Math.max(0, pauses.current - 1);
      },
      isPaused: () => pauses.current > 0,
    }),
    [status, pollRequests],
  );
  return (
    <ShellStatusContext.Provider value={value}>
      {children}
    </ShellStatusContext.Provider>
  );
}

export function useShellStatus(): Value {
  const value = useContext(ShellStatusContext);
  if (value === null)
    throw new Error("useShellStatus outside ShellStatusProvider");
  return value;
}
