"use client";

import { useLayoutEffect, useRef, type JSX, type ReactNode } from "react";

import { Listbox, type ListboxOption } from "@/components/panel/listbox";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { LG_MEDIA } from "@/features/panel-fila/limits";
import type { FilaAba } from "@/features/panel-fila/search-params";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

type Props = {
  aba: FilaAba;
  options: readonly ListboxOption[];
  /** ?aba= and ?ate= as they are, kept when a case opens. */
  query: string;
  selectedId: string | null;
  /** The page's gerado_em (C-M6-1): D3's snapshot and the poll's desde. */
  generatedAt?: string;
  /** Below the options, inside the scroller ("Carregar mais"). */
  children?: ReactNode;
};

function twoPanes(): boolean {
  return window.matchMedia(LG_MEDIA).matches;
}

/**
 * The case list as a listbox (T95), named by the active tab (AC 45).
 * Opening a case pushes /fila/{id} with the same tab and length (soft, with
 * the stall fallback); the detail pane shows its skeleton meanwhile and the
 * heading takes focus when it lands. At lg the list scrolls inside itself
 * (plan § 6) and keeps its position; one pane starts the case at the top.
 * The position comes back once when the list remounts visible. A case
 * being decided leaves the list at once (T105). New cases stay hidden
 * until "Mostrar" (D3, T110).
 */
export function CaseListbox({
  aba,
  options,
  query,
  selectedId,
  generatedAt,
  children,
}: Props): JSX.Element {
  const navigate = useSoftNavigate();
  const {
    openCase,
    focusCase,
    saveScroll,
    takeScroll,
    removal,
    reportList,
    visibleIds,
    observeList,
    online,
  } = useFila();
  const scroller = useRef<HTMLDivElement>(null);

  const serverIds = options.map((option) => option.id);
  const visible = new Set(visibleIds(query, serverIds, selectedId));
  const shown = options.filter((option) => visible.has(option.id));

  // D3: every server render of the list, as the server ordered it.
  const all = serverIds.join("\n");
  useLayoutEffect(() => {
    if (generatedAt === undefined) return;
    observeList({
      aba,
      query,
      ids: all === "" ? [] : all.split("\n"),
      desde: generatedAt,
    });
  }, [aba, all, query, generatedAt, observeList]);

  // The next case after a decision comes from what is rendered here (D5).
  const ids = shown.map((option) => option.id).join("\n");
  useLayoutEffect(() => {
    reportList({ ids: ids === "" ? [] : ids.split("\n"), query });
  }, [ids, query, reportList]);

  useLayoutEffect(() => {
    const wide = twoPanes();
    // Below lg on /fila/{id} the list is hidden: keep the position for later.
    if (selectedId !== null && !wide) return;
    const y = takeScroll(aba);
    if (y === undefined) return;
    if (!wide) window.scrollTo(0, y);
    else if (scroller.current) scroller.current.scrollTop = y;
    // Mount only: a later render must not pull the page back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpen = (id: string) => {
    if (id === selectedId) {
      focusCase(id);
      return;
    }
    const wide = twoPanes();
    saveScroll(aba, wide ? (scroller.current?.scrollTop ?? 0) : window.scrollY);
    openCase(id);
    navigate(`/fila/${encodeURIComponent(id)}${query}`, {
      push: true,
      scroll: !wide,
    });
  };

  return (
    <div
      ref={scroller}
      data-fila-list-scroller
      // At lg the list scrolls inside itself (plan § 6): the viewport minus
      // the shell bar, the Fila header and the tabs (≈ 16rem; a layout
      // measure, not a design token).
      className="flex flex-col gap-4 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto lg:overscroll-contain"
    >
      <Listbox
        options={
          removal === null
            ? shown
            : shown.filter((option) => option.id !== removal.id)
        }
        // A decision in flight selects the next case before the URL moves (D13).
        selectedId={removal === null ? selectedId : removal.next}
        labelledBy={FILA_TAB_ACTIVE_ID}
        onOpen={onOpen}
        // Offline nothing opens: a soft navigation would fall back to a full
        // load, the browser's offline page (D8, G9).
        disabled={!online}
      />
      {children}
    </div>
  );
}
