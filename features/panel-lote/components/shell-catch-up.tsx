"use client";

import { useEffect, useRef } from "react";

import { useShellStatus } from "@/features/panel-shell/shell-status-context";

/**
 * Rendered with a settled batch (result or stopped). The layout's /me and the
 * page's batch are two reads: a render can catch the batch settled while /me
 * still says lote_em_andamento, and nothing else would poll again (T85 E2E).
 * So a shell that says "Verificando" asks for one poll; /me decides (another
 * batch may really be running).
 */
export function ShellCatchUp(): null {
  const { loteRunning, pollNow } = useShellStatus();
  const polled = useRef(false);
  useEffect(() => {
    if (!loteRunning || polled.current) return;
    polled.current = true;
    pollNow();
  }, [loteRunning, pollNow]);
  return null;
}
