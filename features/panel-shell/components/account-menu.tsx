"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";
import { cn } from "@/lib/utils";

type Props = {
  /** The menu's items: elements with role="menuitem" ("Sair"; "Configurações" from M8). */
  children: ReactNode;
  className?: string;
};

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu
    ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    : [];
}

/**
 * "Conta" (plan § 2.8): a menu button. Enter, Space or ArrowDown open it on
 * the first item; arrows move; Esc closes and returns focus to the button.
 */
export function AccountMenu({ children, className }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menuItems(menu.current)[0]?.focus();
    const outside = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close(): void {
    setOpen(false);
    button.current?.focus();
  }

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>): void {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>): void {
    const items = menuItems(menu.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKey}
        className={cn(
          "inline-flex min-h-10 w-full items-center rounded-md px-3 text-body text-ink",
          "hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "pointer-coarse:min-h-11",
        )}
      >
        {shellCopy["account.menu"]}
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          // Focus lives on the items; the menu itself takes none from Tab.
          tabIndex={-1}
          aria-label={shellCopy["account.menu"]}
          onKeyDown={onMenuKey}
          className="absolute bottom-full left-0 z-10 mb-2 flex min-w-40 flex-col rounded-lg border border-line bg-surface p-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}
