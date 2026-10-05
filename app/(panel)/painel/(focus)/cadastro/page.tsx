import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { AuthLinks } from "@/features/panel-auth/components/auth-links";
import { SignupForm } from "@/features/panel-auth/components/signup-form";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import { readSignupCookie } from "@/lib/api/panel/cookies";
import { assertPanelHost } from "@/lib/api/panel/host";
import { getSession } from "@/lib/api/panel/session";
import {
  commercialContactEmail,
  legalLinks,
  turnstileSiteKey,
} from "@/lib/panel-config";
import { PANEL_HOME } from "@/lib/panel-paths";

export const metadata: Metadata = { title: signupCopy["signup.h1"] };

// S1 Cadastro (AC 1, AC 2). "E-mail errado? Voltar" lands here: the pending
// sign-up refills the form, never with the password (ADR-0009 rule 10).
// A valid session goes home, like /entrar (QA plan Q10).
export default async function CadastroPage(): Promise<JSX.Element> {
  await assertPanelHost();
  if ((await getSession()) !== null) redirect(PANEL_HOME);
  const pending = await readSignupCookie();
  const { termsUrl, privacyUrl } = legalLinks();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">
          {signupCopy["signup.h1"]}
        </h1>
        <p className="text-body font-lead text-ink-muted">
          {signupCopy["signup.lead"]}
        </p>
      </div>
      <SignupForm
        termsUrl={termsUrl}
        privacyUrl={privacyUrl}
        turnstileSiteKey={turnstileSiteKey()}
        nonce={nonce}
        commercialEmail={commercialContactEmail()}
        prefill={
          pending === null
            ? null
            : {
                nome: pending.nome,
                workspace: pending.workspace,
                email: pending.email,
              }
        }
      />
      <AuthLinks
        links={[{ href: "/entrar", label: signupCopy["signup.login"] }]}
      />
    </>
  );
}
