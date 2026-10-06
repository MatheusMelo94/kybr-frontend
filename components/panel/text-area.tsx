"use client";

import { useId, type JSX, type Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Visible label. A placeholder never stands in for it. */
  label: string;
  name: string;
  hint?: string;
  /** Field error copy. Sets aria-invalid and joins the description after the hint. */
  error?: string | undefined;
  maxLength?: number;
  rows?: number;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * A labelled multi-line field (the Fila dialogs' note to the seller), styled
 * as TextField. In components/panel so its classes never reach /v's CSS
 * (ADR-0010 Addendum 1).
 */
export function TextArea({
  label,
  name,
  hint,
  error,
  maxLength,
  rows = 3,
  value,
  onChange,
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
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label font-strong text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "w-full resize-y rounded-lg border border-field-line bg-field px-4 py-3 text-input text-ink",
          // hover: applies to fine pointers only (Tailwind 4: @media (hover: hover)).
          "hover:border-ink-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:cursor-not-allowed disabled:text-ink-muted",
          "aria-invalid:border-danger-ink",
        )}
      />
      {hint && (
        <p id={hintId} className="text-secondary text-ink-muted">
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
