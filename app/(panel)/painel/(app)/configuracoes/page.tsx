import type { Metadata } from "next";
import type { JSX } from "react";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { SettingsForm } from "@/features/panel-settings/components/settings-form";
import { settingsCopy } from "@/features/panel-settings/copy";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: settingsCopy["settings.h1"] };

// /configuracoes (S12, AC 60): everything comes from the layout's /me read
// (React cache(), one request). "Link de cadastro" is #link (G2).
export default async function ConfiguracoesPage(): Promise<JSX.Element> {
  const me = await requireSession();
  return (
    <div className="flex max-w-prose min-w-0 flex-col gap-8">
      <h1 className="text-title font-title text-ink">
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
    </div>
  );
}
