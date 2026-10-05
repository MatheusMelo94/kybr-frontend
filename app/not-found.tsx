import type { Metadata } from "next";
import type { JSX } from "react";

import { formCopy } from "@/features/seller-link/copy/form";
import { LinkColumn } from "@/features/seller-link/components/link-column";
import { LinkNotFound } from "@/features/seller-link/components/link-not-found";

import "./(link)/link.css";

// Any unknown path, and malformed slugs (rejected above loading.tsx). It also
// makes the app router, with its per-request CSP nonce, own every 404.
export const metadata: Metadata = { title: formCopy["notfound.h1"] };

export default function NotFound(): JSX.Element {
  return (
    <LinkColumn>
      <LinkNotFound />
    </LinkColumn>
  );
}
