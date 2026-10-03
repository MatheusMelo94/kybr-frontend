import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { caseParamsSchema } from "@/features/seller-link/route-params";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string; token: string }>;
};

// The token's format is checked here, above this route's loading.tsx (and with
// no loading boundary above it: the form's skeleton is scoped to the (form)
// group), so a malformed token answers 404 before anything streams, with no
// API call. c/not-found.tsx renders Case not found for it.
export default async function TokenLayout({
  children,
  params,
}: Props): Promise<JSX.Element> {
  if (!caseParamsSchema.safeParse(await params).success) notFound();
  return <>{children}</>;
}
