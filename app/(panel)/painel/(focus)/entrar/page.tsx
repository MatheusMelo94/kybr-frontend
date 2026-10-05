import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { AuthBanner } from "@/features/panel-auth/components/auth-banner";
import { AuthLinks } from "@/features/panel-auth/components/auth-links";
import { LoginForm } from "@/features/panel-auth/components/login-form";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { entrarParams } from "@/features/panel-auth/route-params";
import { getSession } from "@/lib/api/panel/session";
import { turnstileSiteKey } from "@/lib/panel-config";
import { PANEL_HOME } from "@/lib/panel-paths";

export const metadata: Metadata = { title: loginCopy["login.h1"] };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// S3 Entrar (AC 5). A valid session goes straight on; a stale cookie is
// just ignored here (getSession() is null on a 401), so nothing loops.
export default async function EntrarPage({
  searchParams,
}: Props): Promise<JSX.Element> {
  const { volta, banner } = entrarParams(await searchParams);
  if ((await getSession()) !== null) redirect(volta ?? PANEL_HOME);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <h1 className="text-title font-title text-ink">
        {loginCopy["login.h1"]}
      </h1>
      {banner !== null && <AuthBanner kind={banner} />}
      <LoginForm
        volta={volta}
        turnstileSiteKey={turnstileSiteKey()}
        nonce={nonce}
      />
      <AuthLinks
        links={[
          { href: "/senha/esqueci", label: loginCopy["login.forgot"] },
          { href: "/cadastro", label: loginCopy["login.signup"] },
        ]}
      />
    </>
  );
}
