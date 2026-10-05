import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { AuthLinks } from "@/features/panel-auth/components/auth-links";
import { ConfirmCodeForm } from "@/features/panel-auth/components/confirm-code-form";
import { confirmCopy } from "@/features/panel-auth/copy/confirm";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { CODE_TTL_MINUTES } from "@/features/panel-auth/validation";
import { fill } from "@/features/panel-shell/format";
import { readSignupCookie } from "@/lib/api/panel/cookies";
import { assertPanelHost } from "@/lib/api/panel/host";
import { turnstileSiteKey } from "@/lib/panel-config";

export const metadata: Metadata = { title: confirmCopy["confirm.h1"] };

/** Without the API's time, "Reenviar código" waits 60 s from the page load. */
const DEFAULT_RESEND_WAIT_MS = 60_000;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// S2 Confirmar (AC 3). The pending sign-up lives in the httpOnly cookie
// (P19): no e-mail in the URL. Without it, back to S1.
export default async function ConfirmarPage({
  searchParams,
}: Props): Promise<JSX.Element> {
  await assertPanelHost();
  const pending = await readSignupCookie();
  if (pending === null) redirect("/cadastro");
  const fromLogin = (await searchParams).origem === "login";
  const at = Date.parse(pending.reenviarEm ?? "");
  const resendAvailableInMs = Number.isFinite(at)
    ? Math.max(0, at - Date.now())
    : DEFAULT_RESEND_WAIT_MS;
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-title text-ink">
          {confirmCopy["confirm.h1"]}
        </h1>
        {fromLogin && <Notice>{loginCopy["login.notice.unconfirmed"]}</Notice>}
        <p className="text-body text-ink">
          {fill(confirmCopy["confirm.body"], {
            email: pending.email,
            minutos: CODE_TTL_MINUTES,
          })}
        </p>
      </div>
      <ConfirmCodeForm
        email={pending.email}
        resendAvailableInMs={resendAvailableInMs}
        turnstileSiteKey={turnstileSiteKey()}
        nonce={nonce}
      />
      <AuthLinks
        links={[{ href: "/cadastro", label: confirmCopy["confirm.back"] }]}
      />
    </>
  );
}
