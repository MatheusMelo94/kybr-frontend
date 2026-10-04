"use client";

import { useId, type JSX, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Visible label; may hold links (they keep working inside it). */
  label: ReactNode;
  name: string;
  hint?: string;
  /** Field error copy: sets aria-invalid and joins the description after the hint. */
  error?: string | undefined;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** A native checkbox, 24 px, in a label that's ≥ 44 px tall on coarse pointers. */
export function Checkbox({
  label,
  name,
  hint,
  error,
  checked,
  defaultChecked,
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
      <label
        htmlFor={id}
        className="flex min-h-6 items-start gap-3 text-secondary text-ink pointer-coarse:min-h-11"
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          defaultChecked={defaultChecked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "mt-0 size-6 shrink-0 accent-accent",
            "hover:cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            "aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-danger-ink",
            "disabled:cursor-not-allowed",
          )}
        />
        <span className="pt-0.5">{label}</span>
      </label>
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
