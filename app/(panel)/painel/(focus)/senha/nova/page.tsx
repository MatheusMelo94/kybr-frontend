import type { Metadata } from "next";
import type { JSX } from "react";

import { NewPasswordForm } from "@/features/panel-auth/components/new-password-form";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { assertPanelHost } from "@/lib/api/panel/host";

export const metadata: Metadata = { title: resetCopy["reset.new.h1"] };

// S3 Nova senha (AC 6, P04). The token is in the URL fragment, which the
// server never receives: this GET has no side effect, so e-mail link
// scanners that prefetch it consume nothing.
export default async function NovaSenhaPage(): Promise<JSX.Element> {
  await assertPanelHost();

  return (
    <>
      <h1 className="text-title font-title text-ink">
        {resetCopy["reset.new.h1"]}
      </h1>
      <NewPasswordForm />
    </>
  );
}
