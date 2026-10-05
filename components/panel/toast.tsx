"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import {
  TOAST_CLOSE,
  TOAST_ITEM,
  TOAST_REGION,
} from "@/components/panel/toast-styles";

/** How long a toast stays (paused while hovered or focused). */
export const TOAST_MS = 5_000;
/** The exit (--duration-fast): the toast is removed after it. */
export const TOAST_EXIT_MS = 150;
const MAX_TOASTS = 3;

type Toast = { id: number; message: string; leaving: boolean };

const ToastContext = createContext<{ show: (message: string) => void } | null>(
  null,
);

type ItemProps = {
  toast: Toast;
  closeLabel: string;
  onDismiss: (id: number) => void;
};

function ToastItem({ toast, closeLabel, onDismiss }: ItemProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(TOAST_MS);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || toast.leaving) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, toast.leaving, toast.id, onDismiss]);

  return (
    <div
      data-leaving={toast.leaving ? "" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      className={TOAST_ITEM}
    >
      <p className="min-w-0 flex-1 self-center py-1 break-words">
        {toast.message}
      </p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => onDismiss(toast.id)}
        className={TOAST_CLOSE}
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
  );
}

type Props = {
  /** common.close, from the panel's copy. */
  closeLabel: string;
  children: ReactNode;
};

/**
 * The panel's toasts (spec § Motion Intent, S7 action results): one polite
 * live region, mounted at first paint so additions are announced. A toast
 * takes no focus, stays 5 s (paused while hovered or focused), can be closed,
 * and at most 3 stack (a 4th sends the oldest out).
 */
export function ToastProvider({ closeLabel, children }: Props): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const removing = useRef(new Set<number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) =>
      list.map((toast) =>
        toast.id === id ? { ...toast, leaving: true } : toast,
      ),
    );
  }, []);

  const show = useCallback((message: string) => {
    const id = ++nextId.current;
    setToasts((list) => {
      const active = list.filter((toast) => !toast.leaving);
      const excess = active.length + 1 - MAX_TOASTS;
      const outgoing = new Set(
        active.slice(0, Math.max(0, excess)).map((t) => t.id),
      );
      return [
        ...list.map((toast) =>
          outgoing.has(toast.id) ? { ...toast, leaving: true } : toast,
        ),
        { id, message, leaving: false },
      ];
    });
  }, []);

  // A leaving toast is removed once its exit has played.
  useEffect(() => {
    for (const toast of toasts) {
      if (!toast.leaving || removing.current.has(toast.id)) continue;
      removing.current.add(toast.id);
      setTimeout(() => {
        removing.current.delete(toast.id);
        setToasts((list) => list.filter((item) => item.id !== toast.id));
      }, TOAST_EXIT_MS);
    }
  }, [toasts]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className={TOAST_REGION}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            closeLabel={closeLabel}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { show: (message: string) => void } {
  const value = useContext(ToastContext);
  if (value === null) throw new Error("useToast outside ToastProvider");
  return value;
}
