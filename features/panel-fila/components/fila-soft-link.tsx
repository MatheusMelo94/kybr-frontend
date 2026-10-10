"use client";

import type { JSX, ComponentProps } from "react";

import { SoftLink } from "@/components/panel/soft-link";
import { useFilaOnline } from "@/features/panel-fila/components/fila-provider";

/** The Fila's tabs and "Carregar mais": a SoftLink that goes nowhere offline (D8, G9). */
export function FilaSoftLink(
  props: Omit<ComponentProps<typeof SoftLink>, "disabled">,
): JSX.Element {
  return <SoftLink {...props} disabled={!useFilaOnline()} />;
}
