import type { Metadata } from "next";
import type { JSX } from "react";

import { formCopy } from "@/features/seller-link/copy/form";
import { LinkNotFound } from "@/features/seller-link/components/link-not-found";

export const metadata: Metadata = { title: formCopy["notfound.h1"] };

export default function SlugNotFound(): JSX.Element {
  return <LinkNotFound />;
}
