import { redirect } from "next/navigation";
import type { JSX, ReactNode } from "react";

import { requireSession } from "@/lib/api/panel/session";

type Props = {
  children: ReactNode;
};

// The signed-in panel (plan § 2.2): a session, and onboarding done
// (T54); the shell around it arrives in T55.
export default async function AppLayout({
  children,
}: Props): Promise<JSX.Element> {
  const me = await requireSession();
  if (!me.workspace.onboarding_concluido) redirect("/comecar");
  return <>{children}</>;
}
