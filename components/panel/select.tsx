"use client";

import { useId, type JSX, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The <option>s. */
  children: ReactNode;
  name?: string;
  hint?: string;
  /** Field error copy: sets aria-invalid and joins the description after the hint. */
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLSelectElement>;
};

/** A native select with a visible label; ≥ 40 px, ≥ 44 px on coarse pointers. */
export function Select({
  label,
  value,
  onChange,
  children,
  name,
  hint,
  error,
  disabled,
  className,
  ref,
}: Props): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className="text-label font-strong break-words text-ink"
      >
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          // WebKit sizes a <select> to its longest option: min-w-0 + max-w-full
          // let it shrink inside a flex column at 360 px / 200 % (AC 74).
          "min-h-10 w-full max-w-full min-w-0 rounded-lg border border-field-line bg-field px-3 text-body text-ink",
          "hover:border-ink-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "aria-invalid:border-danger-ink",
          "disabled:cursor-not-allowed",
          "pointer-coarse:min-h-11",
        )}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className="text-secondary break-words text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-secondary text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
