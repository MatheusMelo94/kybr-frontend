import type { Metadata } from "next";
import type { JSX } from "react";

import { CaseNotFound } from "@/features/panel-fila/components/case-not-found";
import { filaCopy } from "@/features/panel-fila/copy";

export const metadata: Metadata = { title: filaCopy["fila.notfound.h"] };

export default function CaseNotFoundPage(): JSX.Element {
  return <CaseNotFound />;
}
