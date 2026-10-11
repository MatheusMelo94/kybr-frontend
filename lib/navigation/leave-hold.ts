// P8-005 (plan-m8 D8): a dirty form (Regras) holds actions that leave the
// page without a link click, like the account menu's Sair, whose server
// redirect is a soft navigation beforeunload never sees. The page's guard
// registers a holder while dirty; the action asks it first. The holder
// keeps `proceed`, not the DOM: the menu unmounts its item when the dialog
// takes focus.

type Holder = (proceed: () => void) => boolean;

let holder: Holder | null = null;

/** Registers (or, with null, clears) the page's holder. */
export function setLeaveHolder(next: Holder | null): void {
  holder = next;
}

/** True when a holder kept `proceed` for its own confirmation; then don't go. */
export function holdLeave(proceed: () => void): boolean {
  return holder?.(proceed) ?? false;
}
