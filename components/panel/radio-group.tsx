"use client";

import { useId, type JSX, type Ref } from "react";

import { cn } from "@/lib/utils";

export type RadioOption = {
  value: string;
  label: string;
  /** A second line, read as the radio's description. */
  description?: string;
};

type Props = {
  legend: string;
  name: string;
  options: readonly RadioOption[];
  hint?: string;
  /** Group error copy: every radio is marked invalid and described by it. */
  error?: string | undefined;
  value?: string | undefined;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Lands on the checked radio, or the first: what a form focuses on error. */
  ref?: Ref<HTMLInputElement>;
};

/** A fieldset of native radios named by its legend (one Tab stop, arrows move). */
export function RadioGroup({
  legend,
  name,
  options,
  hint,
  error,
  value,
  onChange,
  disabled,
  className,
  ref,
}: Props): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const focusTarget = options.some((option) => option.value === value)
    ? value
    : options[0]?.value;

  return (
    <fieldset
      // A radiogroup, named by its legend, carries the group's error state
      // (aria-invalid isn't valid on a radio itself).
      role="radiogroup"
      aria-invalid={error ? true : undefined}
      aria-describedby={
        [hint && hintId, error && errorId].filter(Boolean).join(" ") ||
        undefined
      }
      className={cn("flex flex-col gap-2", className)}
      disabled={disabled}
    >
      <legend className="mb-2 text-xs font-strong text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-secondary text-ink-muted">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          const labelId = `${optionId}-label`;
          const descriptionId = `${optionId}-description`;
          const describedBy = [
            option.description && descriptionId,
            hint && hintId,
            error && errorId,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-6 items-start gap-3 py-1 text-body text-ink pointer-coarse:min-h-11"
            >
              <input
                ref={option.value === focusTarget ? ref : undefined}
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={
                  value === undefined ? undefined : value === option.value
                }
                onChange={() => onChange?.(option.value)}
                // The name is the label text only; the second line describes it.
                aria-labelledby={labelId}
                aria-describedby={describedBy || undefined}
                className={cn(
                  "size-6 shrink-0 accent-accent",
                  "hover:cursor-pointer",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  "disabled:cursor-not-allowed",
                )}
              />
              <span className="flex flex-col pt-0.5">
                <span id={labelId}>{option.label}</span>
                {option.description && (
                  <span
                    id={descriptionId}
                    className="text-secondary text-ink-muted"
                  >
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-secondary text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}
