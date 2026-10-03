import { notFound } from "next/navigation";
import type { JSX } from "react";

import { formCopy } from "@/features/seller-link/copy/form";
import { slugParamsSchema } from "@/features/seller-link/route-params";
import { getPublicLink } from "@/lib/api/public-link";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function FormPage({
  params,
}: Props): Promise<JSX.Element> {
  const parsed = slugParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const link = await getPublicLink(parsed.data.slug);
  if (!link.ok) notFound();

  return <h1 className="text-title font-title">{formCopy["form.h1"]}</h1>;
}
