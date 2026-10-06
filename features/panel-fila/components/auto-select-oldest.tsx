"use client";

import { useEffect, useRef } from "react";

import { LG_MEDIA } from "@/features/panel-fila/limits";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

type Props = {
  oldestId: string;
  /** ?aba= and ?ate= as they are. */
  query: string;
};

/**
 * D4: at lg and up, /fila opens the oldest case (the server can't know the
 * viewport). A replace, so Back doesn't return to the bare list; once per
 * mount; no focus move. Below lg, /fila stays the list.
 */
export function AutoSelectOldest({ oldestId, query }: Props): null {
  const navigate = useSoftNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !window.matchMedia(LG_MEDIA).matches) return;
    done.current = true;
    navigate(`/fila/${encodeURIComponent(oldestId)}${query}`);
  }, [navigate, oldestId, query]);

  return null;
}
