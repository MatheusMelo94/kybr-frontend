import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { slugParamsSchema } from "@/features/seller-link/route-params";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

// The slug's format is checked here, above loading.tsx's Suspense boundary, so
// a malformed slug answers 404 before anything streams, with no API call.
export default async function SlugLayout({
  children,
  params,
}: Props): Promise<JSX.Element> {
  if (!slugParamsSchema.safeParse(await params).success) notFound();
  return <>{children}</>;
}
