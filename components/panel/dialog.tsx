"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  DIALOG,
  DIALOG_BODY,
  DIALOG_CLOSE,
} from "@/components/panel/dialog-styles";
import { useDialogDraft } from "@/features/panel-shell/components/session-expiry-provider";

type Props = {
  open: boolean;
  /** Esc, a platform close request or the close button. Never while busy. */
  onClose: () => void;
  /** The heading that names the dialog. */
  title: string;
  /** common.close, from the panel's copy. */
  closeLabel: string;
  /** A submit is in flight: nothing closes the dialog. */
  busy?: boolean;
  /** Unsent input: a session expiry then says it was lost (AC 7, perdido=1). */
  dirty?: boolean;
  /** Where focus lands on open; otherwise the first field. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

const FIELDS = "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/**
 * A modal dialog on the native <dialog> (showModal(): top layer, background
 * inert, focus contained). A centred dialog at lg and up, a full-height
 * bottom sheet below (dialog-styles.ts). Focus returns to the element that
 * had it when the dialog opened.
 */
export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  busy = false,
  dirty = false,
  initialFocus,
  children,
}: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const latest = useRef({ onClose, busy });
  const headingId = useId();

  useLayoutEffect(() => {
    latest.current = { onClose, busy };
  });

  useDialogDraft(open && dirty);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      trigger.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
      const target =
        initialFocus?.current ?? body.current?.querySelector<HTMLElement>(FIELDS);
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocus(trigger);
    }
  }, [open, initialFocus]);

  // Unmounted while open: the top layer goes with it; focus still returns.
  useEffect(() => () => restoreFocus(trigger), []);

  // A close request the dialog didn't ask for (the platform's cancel, e.g.
  // Android's back): kept open, and routed through onClose unless busy.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (!latest.current.busy) latest.current.onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  // Esc is handled here, not by the platform: preventing the keydown keeps a
  // busy dialog open even where a repeated cancel can't be prevented.
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      className={DIALOG}
    >
      <div className={DIALOG_BODY}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="text-h2 font-title text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
            className={DIALOG_CLOSE}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 16 16"
              className="size-4"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </dialog>
  );
}

function restoreFocus(trigger: RefObject<HTMLElement | null>): void {
  const element = trigger.current;
  trigger.current = null;
  if (element?.isConnected) element.focus();
}
