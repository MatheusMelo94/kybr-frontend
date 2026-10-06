"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type JSX } from "react";

import { Select } from "@/components/panel/select";
import { STATUS_WORDS } from "@/features/panel-lote/components/status-word";
import { loteCopy } from "@/features/panel-lote/copy";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";
import {
  BATCH_ROW_STATUSES,
  type BatchRowStatus,
} from "@/lib/panel-api-values";

/**
 * "Mostrar" (AC 21): the status filter lives in the URL (?status=). A change
 * replaces the URL without scrolling (useSoftNavigate, with its fallback);
 * the server reads the first page again, and the select keeps (or, after a
 * re-mount, gets back) its focus.
 */
// A change re-renders the table section through its in-page Suspense
// boundary (T83), whose fallback can hide the subtree while the server
// renders, and that drops focus. This one-shot flag gives the select its
// focus back once the new status arrives. (Module state, so one per page.
// Security ruled the sessionStorage flag below OK under C8 as it stands: the
// constant "1" under a fixed key, set only before the fallback's reload,
// cleared on read, every access in try/catch. Never store data in it.)
let refocus = false;
// The same, across the fallback's full reload (a UI flag only, never data).
const REFOCUS_KEY = "kybr-lote-filter-focus";

function stalled(url: string): void {
  try {
    sessionStorage.setItem(REFOCUS_KEY, "1");
  } catch {
    // Storage off: the reload just won't restore the focus.
  }
  window.location.replace(url);
}

function takeStoredRefocus(): boolean {
  try {
    const stored = sessionStorage.getItem(REFOCUS_KEY) === "1";
    sessionStorage.removeItem(REFOCUS_KEY);
    return stored;
  } catch {
    return false;
  }
}

export function StatusFilter({
  status,
}: {
  status: BatchRowStatus | undefined;
}): JSX.Element {
  const navigate = useSoftNavigate(stalled);
  const pathname = usePathname();
  const select = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const stored = takeStoredRefocus();
    if (!refocus && !stored) return;
    refocus = false;
    // The page may still be hidden for a few frames as the navigation
    // commits: try until the select can take focus (about a third of a second).
    let frames = 0;
    let handle = 0;
    const tryFocus = (): void => {
      const element = select.current;
      if (element === null) return;
      element.focus();
      if (document.activeElement !== element && frames++ < 20)
        handle = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(handle);
  }, [status]);

  return (
    <Select
      ref={select}
      label={loteCopy["lote.table.filter"]}
      value={status ?? ""}
      onChange={(value) => {
        const query = new URLSearchParams();
        if (value !== "") query.set("status", value);
        const search = query.toString();
        refocus = true;
        navigate(search === "" ? pathname : `${pathname}?${search}`);
      }}
      className="max-w-xs"
    >
      <option value="">{loteCopy["lote.table.filter.all"]}</option>
      {BATCH_ROW_STATUSES.map((value) => (
        <option key={value} value={value}>
          {STATUS_WORDS[value].word}
        </option>
      ))}
    </Select>
  );
}
