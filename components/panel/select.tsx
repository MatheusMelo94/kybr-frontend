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
      {/* relative: holds the drawn chevron. WebKit's native menulist won't
          shrink below its longest option (AC 74 at 360 px / 200 %), so the
          control is appearance-none with its own chevron. */}
      <div className="relative min-w-0">
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
            "min-h-10 w-full max-w-full min-w-0 appearance-none truncate rounded-lg border border-field-line bg-field py-2 pr-10 pl-3 text-body text-ink",
            "hover:border-ink-muted",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            "aria-invalid:border-danger-ink",
            "disabled:cursor-not-allowed",
            "pointer-coarse:min-h-11",
          )}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {hint && (
        <p id={hintId} className="text-secondary break-words text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-secondary break-words text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
