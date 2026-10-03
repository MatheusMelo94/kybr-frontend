"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { JSX } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";

// A client leaf only because not-found.tsx gets no params: the slug comes from
// the URL, which the slug layout already checked against X3.

/** "Começar de novo": back to this link's empty form (spec AC 27). */
export function RestartLink(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Link
      href={`/v/${encodeURIComponent(slug)}`}
      className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-body font-strong text-accent-ink transition-colors duration-(--duration-fast) ease-out-quart hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:bg-accent/80 motion-reduce:transition-none"
    >
      {caseCopy["casenotfound.cta"]}
    </Link>
  );
}
