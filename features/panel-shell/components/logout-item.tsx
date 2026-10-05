import type { JSX } from "react";

import { logoutAction } from "@/features/panel-auth/actions";
import { shellCopy } from "@/features/panel-shell/copy/shell";

/**
 * "Sair" (AC 8, P15): a POST form to logoutAction, never a link or a GET (a
 * prefetched GET logout is CSRF and self-logout). The action redirects to
 * /entrar itself; no client navigation races it.
 */
export function LogoutItem(): JSX.Element {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        role="menuitem"
        className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-body text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11"
      >
        {shellCopy["account.logout"]}
      </button>
    </form>
  );
}
