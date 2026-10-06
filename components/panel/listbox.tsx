"use client";

import {
  useEffect,
  useId,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type ListboxOption = { id: string; content: ReactNode };

type Props = {
  options: readonly ListboxOption[];
  /** The option that is open (aria-selected). */
  selectedId?: string | null | undefined;
  /** Enter, Space or a click on an option. */
  onOpen: (id: string) => void;
  /** aria-disabled, and nothing opens (offline, G9). */
  disabled?: boolean | undefined;
  className?: string;
} & ({ label: string; labelledBy?: never } | { labelledBy: string; label?: never });

/**
 * A single-select list with one tab stop: focus stays on the listbox and
 * aria-activedescendant points at the active option (WAI-ARIA APG Listbox).
 * Up/Down move without wrapping, Home/End jump, Enter/Space or a click open.
 * No type-ahead: a letter key does nothing (WCAG 2.1.4). The caller renders
 * each option's content.
 */
export function Listbox({
  options,
  selectedId,
  onOpen,
  disabled = false,
  className,
  label,
  labelledBy,
}: Props): JSX.Element {
  const prefix = useId();
  const optionId = (id: string) => `${prefix}-option-${id}`;
  const [activeState, setActiveState] = useState<string | null>(null);
  const has = (id: string | null | undefined): id is string =>
    id != null && options.some((option) => option.id === id);
  const activeId = has(activeState)
    ? activeState
    : has(selectedId)
      ? selectedId
      : (options[0]?.id ?? null);
  const activeIndex = options.findIndex((option) => option.id === activeId);

  useEffect(() => {
    if (activeState === null || activeId === null) return;
    document
      .getElementById(`${prefix}-option-${activeId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId, activeState, prefix]);

  const open = (id: string | null) => {
    if (id !== null && !disabled) onOpen(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const move = (index: number) =>
      setActiveState(options[Math.min(Math.max(index, 0), last)]?.id ?? null);
    switch (event.key) {
      case "ArrowDown":
        move(activeIndex + 1);
        break;
      case "ArrowUp":
        move(activeIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(last);
        break;
      case "Enter":
      case " ":
        open(activeId);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onClick = (event: MouseEvent<HTMLUListElement>) => {
    const option = (event.target as Element).closest<HTMLElement>(
      "[role=option]",
    );
    const id = option?.dataset.id;
    if (id === undefined || !has(id)) return;
    setActiveState(id);
    open(id);
  };

  return (
    <ul
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeId === null ? undefined : optionId(activeId)}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={cn(
        "group flex flex-col",
        // The ring moves to the active option; an empty list keeps its own.
        options.length > 0
          ? "outline-none"
          : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      {options.map((option) => (
        <li
          key={option.id}
          id={optionId(option.id)}
          role="option"
          aria-selected={option.id === selectedId}
          data-id={option.id}
          data-active={option.id === activeId || undefined}
          className={cn(
            "min-h-6 cursor-pointer pointer-coarse:min-h-11",
            // The focus ring sits on the active option while the listbox
            // has keyboard focus (the listbox itself draws none).
            "group-focus-visible:data-active:outline-2 group-focus-visible:data-active:-outline-offset-2 group-focus-visible:data-active:outline-focus",
            disabled && "cursor-default",
          )}
        >
          {option.content}
        </li>
      ))}
    </ul>
  );
}
