"use client";

import { startTransition, type FormEvent, type JSX } from "react";

import { logoutAction } from "@/features/panel-auth/actions";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { holdLeave } from "@/lib/navigation/leave-hold";

/**
 * P8-005: a dirty page (Regras) may hold the sign-out for its leave dialog;
 * then it runs the action itself once confirmed (the menu, and this form,
 * are gone by then). Without JS the form still posts.
 */
function holdForDraft(event: FormEvent<HTMLFormElement>): void {
  if (holdLeave(() => startTransition(() => logoutAction())))
    event.preventDefault();
}

/**
 * "Sair" (AC 8, P15): a POST form to logoutAction, never a link or a GET (a
 * prefetched GET logout is CSRF and self-logout). The action redirects to
 * /entrar itself; no client navigation races it. A client leaf only for
 * the leave hold (P8-005).
 */
export function LogoutItem(): JSX.Element {
  return (
    <form action={logoutAction} onSubmit={holdForDraft}>
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
