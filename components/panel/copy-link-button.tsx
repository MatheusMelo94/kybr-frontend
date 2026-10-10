"use client";

import { useEffect, useRef, useState, type JSX } from "react";

import { FormAlert } from "@/components/panel/form-alert";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  /** The link to copy. F9: only ever an input's value. */
  value: string;
  /** The button's text. */
  label: string;
  /** The read-only input's accessible name. */
  inputLabel: string;
  /** "always": the input shows from the start; "on-error": only after a failed copy. */
  inputVisible: "always" | "on-error";
};

/**
 * Copies a link (promoted from M6's RequestLinkPanel; plan-m8 § 2). A success
 * toasts toast.link_copied (never the link); a denial, or no clipboard API,
 * shows copy.error with the link in a read-only input, focused and selected
 * for a manual copy. F9: the link is never an href, a title or a label, and
 * the clipboard is only written, inside the click.
 */
export function CopyLinkButton({
  value,
  label,
  inputLabel,
  inputVisible,
}: Props): JSX.Element {
  const { show } = useToast();
  const input = useRef<HTMLInputElement>(null);
  // Failed copies so far (0: none, or the last one succeeded).
  const [failures, setFailures] = useState(0);
  const failed = failures > 0;

  // After the commit that shows the input: hand the link to the user.
  useEffect(() => {
    if (failures === 0) return;
    input.current?.focus();
    input.current?.select();
  }, [failures]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // A rejection, or no clipboard API at all: copy by hand.
      setFailures((n) => n + 1);
      return;
    }
    setFailures(0);
    show(globalCopy["toast.link_copied"]);
  }

  const showInput = inputVisible === "always" || failed;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {showInput && (
          <input
            ref={input}
            type="text"
            readOnly
            value={value}
            aria-label={inputLabel}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            className="min-w-0 flex-1 rounded-lg border border-field-line bg-field px-4 py-2 text-secondary text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        )}
        <Button
          type="button"
          variant="secondary"
          size="panel"
          onClick={() => void copy()}
        >
          {label}
        </Button>
      </div>
      <FormAlert>{failed && globalCopy["copy.error"]}</FormAlert>
    </div>
  );
}
