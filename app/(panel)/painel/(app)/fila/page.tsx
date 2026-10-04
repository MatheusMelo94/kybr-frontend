import type { Metadata } from "next";
import type { JSX } from "react";

import { FilaStub } from "@/features/panel-shell/components/fila-stub";
import { shellCopy } from "@/features/panel-shell/copy/shell";

export const metadata: Metadata = { title: shellCopy["fila.h1"] };

// M4 stub: replaced in M6 by the Fila (list + case detail).
export default function FilaPage(): JSX.Element {
  return <FilaStub />;
}
