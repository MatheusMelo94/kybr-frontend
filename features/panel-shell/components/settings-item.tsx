import Link from "next/link";
import type { JSX } from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";

/** "Configurações" in the account menu (T135): opens /configuracoes. */
export function SettingsItem(): JSX.Element {
  return (
    <Link
      href="/configuracoes"
      role="menuitem"
      className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-body text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11"
    >
      {shellCopy["account.settings"]}
    </Link>
  );
}
