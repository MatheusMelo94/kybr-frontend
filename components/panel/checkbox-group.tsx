"use client";

import { useId, type JSX, type Ref } from "react";

import { cn } from "@/lib/utils";

export type CheckboxOption = { value: string; label: string };

type Props = {
  legend: string;
  name: string;
  options: readonly CheckboxOption[];
  /** The checked values; onChange reports them in the options' order. */
  values: readonly string[];
  onChange?: (values: string[]) => void;
  /** Group error copy: the group is marked invalid and described by it. */
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
  /** Lands on the first checkbox: what a form focuses on error. */
  ref?: Ref<HTMLInputElement>;
};

/** A fieldset of native checkboxes named by its legend (RadioGroup's sibling). */
export function CheckboxGroup({
  legend,
  name,
  options,
  values,
  onChange,
  error,
  disabled,
  className,
  ref,
}: Props): JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;

  function toggle(value: string, checked: boolean): void {
    onChange?.(
      options
        .map((option) => option.value)
        .filter((candidate) =>
          candidate === value ? checked : values.includes(candidate),
        ),
    );
  }

  return (
    <fieldset
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className={cn("flex flex-col gap-2", className)}
      disabled={disabled}
    >
      <legend className="mb-2 text-label font-strong text-ink">{legend}</legend>
      <div className="flex flex-col gap-1">
        {options.map((option, index) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-6 items-start gap-3 py-1 text-body text-ink pointer-coarse:min-h-11"
            >
              <input
                ref={index === 0 ? ref : undefined}
                id={optionId}
                type="checkbox"
                name={name}
                value={option.value}
                checked={values.includes(option.value)}
                onChange={(event) => toggle(option.value, event.target.checked)}
                className={cn(
                  "size-6 shrink-0 accent-accent",
                  "hover:cursor-pointer",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  "disabled:cursor-not-allowed",
                )}
              />
              <span className="pt-0.5">{option.label}</span>
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
