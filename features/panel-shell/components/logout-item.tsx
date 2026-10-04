"use client";

import type { JSX } from "react";

import { logoutAction } from "@/features/panel-auth/actions";
import { shellCopy } from "@/features/panel-shell/copy/shell";

/**
 * "Sair" (AC 8, P15): a POST form to logoutAction, never a link or a GET (a
 * prefetched GET logout is CSRF and self-logout). Afterwards a full page
 * load, which drops the client router cache.
 */
export function LogoutItem(): JSX.Element {
  async function logout(): Promise<void> {
    const { next } = await logoutAction();
    window.location.assign(next);
  }

  return (
    <form action={logout}>
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
