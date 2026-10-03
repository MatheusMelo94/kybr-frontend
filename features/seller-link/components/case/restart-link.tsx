"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { JSX } from "react";

import { PRIMARY_ACTION_LINK } from "@/features/seller-link/components/case/action-link-styles";
import { caseCopy } from "@/features/seller-link/copy/case";
import { cn } from "@/lib/utils";

// A client leaf only because not-found.tsx gets no params: the slug comes from
// the URL, which the slug layout already checked against X3.

/** "Começar de novo": back to this link's empty form (spec AC 27). */
export function RestartLink(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Link
      href={`/v/${encodeURIComponent(slug)}`}
      className={cn("mt-3", PRIMARY_ACTION_LINK)}
    >
      {caseCopy["casenotfound.cta"]}
    </Link>
  );
}
