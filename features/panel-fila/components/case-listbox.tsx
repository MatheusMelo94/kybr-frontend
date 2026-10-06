"use client";

import { useRouter } from "next/navigation";
import type { JSX } from "react";

import { Listbox, type ListboxOption } from "@/components/panel/listbox";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";

type Props = {
  options: readonly ListboxOption[];
  /** ?aba= and ?ate= as they are, kept when a case opens. */
  query: string;
  selectedId: string | null;
};

/**
 * The case list as a listbox (T95), named by the active tab. Opening a case
 * goes to /fila/{id} with the same tab and length; T99 adds the pending
 * skeleton, focus and scroll.
 */
export function CaseListbox({
  options,
  query,
  selectedId,
}: Props): JSX.Element {
  const router = useRouter();
  return (
    <Listbox
      options={options}
      selectedId={selectedId}
      labelledBy={FILA_TAB_ACTIVE_ID}
      onOpen={(id) => router.push(`/fila/${encodeURIComponent(id)}${query}`)}
    />
  );
}
