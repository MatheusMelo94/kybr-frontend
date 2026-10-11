import type { Metadata } from "next";
import type { JSX } from "react";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { PasswordForm } from "@/features/panel-settings/components/password-form";
import { SettingsForm } from "@/features/panel-settings/components/settings-form";
import { settingsCopy } from "@/features/panel-settings/copy";
import { SETTINGS_H1_ID } from "@/features/panel-settings/ids";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: settingsCopy["settings.h1"] };

// /configuracoes (S12, AC 60): everything comes from the layout's /me read
// (React cache(), one request). "Link de cadastro" is #link (G2).
export default async function ConfiguracoesPage(): Promise<JSX.Element> {
  const me = await requireSession();
  return (
    <div className="flex max-w-prose min-w-0 flex-col gap-8">
      <h1
        id={SETTINGS_H1_ID}
        tabIndex={-1}
        className="text-title font-title text-ink focus:outline-none"
      >
        {settingsCopy["settings.h1"]}
      </h1>
      <SettingsForm
        initial={{
          nome_plataforma: me.workspace.nome,
          contato_vendedor: me.workspace.contato_vendedor ?? {
            tipo: "email",
            valor: "",
          },
          nome: me.nome ?? "",
          email: me.email,
        }}
        link={
          <section
            id="link"
            aria-labelledby="settings-link-h"
            className="flex min-w-0 scroll-mt-6 flex-col gap-4"
          >
            <h2 id="settings-link-h" className="text-h2 font-title text-ink">
              {settingsCopy["settings.link.h"]}
            </h2>
            <CopyLinkButton
              value={me.workspace.link_url}
              label={settingsCopy["settings.link.copy"]}
              inputLabel={settingsCopy["settings.link.h"]}
              inputVisible="always"
            />
          </section>
        }
      />
      <PasswordForm email={me.email} />
    </div>
  );
}
