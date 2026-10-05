import {
  useId,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type JSX,
  type Ref,
} from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Visible label. A placeholder never stands in for it. */
  label: string;
  name: string;
  hint?: string;
  /** Field error copy. Sets aria-invalid and joins the description after the hint. */
  error?: string;
  /** Ids of other messages that describe the field (e.g. a form-level error), after the hint and error. */
  describedBy?: string | undefined;
  type?: "text" | "email" | "password";
  inputMode?: "text" | "numeric" | "email";
  autoComplete?: string;
  autoCapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
  /** Safari's non-standard autocorrect switch. */
  autoCorrect?: "on" | "off";
  spellCheck?: boolean;
  placeholder?: string;
  maxLength?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  /** IME / dead-key composition: lets a filtering field leave the value alone while composing. */
  onCompositionStart?: (event: CompositionEvent<HTMLInputElement>) => void;
  onCompositionEnd?: (event: CompositionEvent<HTMLInputElement>) => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

export function TextField({
  label,
  name,
  hint,
  error,
  describedBy: extraDescribedBy,
  type = "text",
  inputMode,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  placeholder,
  maxLength,
  value,
  defaultValue,
  onChange,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  className,
  ref,
}: Props): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId, extraDescribedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-xs font-strong text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "h-12 w-full rounded-lg border border-field-line bg-field px-4 text-base text-ink",
          // hover: applies to fine pointers only (Tailwind 4: @media (hover: hover)).
          "hover:border-ink-muted",
          "placeholder:text-ink-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
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
