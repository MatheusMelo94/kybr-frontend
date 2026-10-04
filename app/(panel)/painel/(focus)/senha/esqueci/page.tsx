import type { Metadata } from "next";
import { headers } from "next/headers";
import type { JSX } from "react";

import { AuthLinks } from "@/features/panel-auth/components/auth-links";
import { ResetRequestForm } from "@/features/panel-auth/components/reset-request-form";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { assertPanelHost } from "@/lib/api/panel/host";
import { turnstileSiteKey } from "@/lib/panel-config";

export const metadata: Metadata = { title: resetCopy["reset.h1"] };

// S3 Recuperar senha (AC 6). Referrer-Policy: no-referrer comes from middleware.
export default async function EsqueciPage(): Promise<JSX.Element> {
  await assertPanelHost();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">
          {resetCopy["reset.h1"]}
        </h1>
        <p className="text-body font-lead text-ink-muted">
          {resetCopy["reset.lead"]}
        </p>
      </div>
      <ResetRequestForm turnstileSiteKey={turnstileSiteKey()} nonce={nonce} />
      <AuthLinks links={[{ href: "/entrar", label: loginCopy["login.h1"] }]} />
    </>
  );
}
