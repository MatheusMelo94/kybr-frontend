import type { Metadata } from "next";
import type { JSX } from "react";

import { CaseNotFound } from "@/features/seller-link/components/case/case-not-found";
import { caseCopy } from "@/features/seller-link/copy/case";

export const metadata: Metadata = { title: caseCopy["casenotfound.h1"] };

export default function CaseNotFoundPage(): JSX.Element {
  return <CaseNotFound />;
}
