import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

// The panel's table styles (spec § Accessibility Acceptance › Tables): a real
// <table> in a card that scrolls sideways below 560 px, header cells scoped to
// their column, figures tabular, long text wrapping. Server-safe.

type TableProps = {
  /** Names the scrolling card (a region reachable from the keyboard). */
  label: string;
  children: ReactNode;
  className?: string;
};

export function Table({ label, children, className }: TableProps): JSX.Element {
  return (
    <div
      role="region"
      aria-label={label}
      // A scrolling region must take focus so the keyboard can scroll it
      // (axe scrollable-region-focusable, WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        "overflow-x-auto rounded-lg border border-line",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <table className="w-full min-w-[35rem] border-collapse text-left text-secondary text-ink tabular-nums">
        {children}
      </table>
    </div>
  );
}

type CellProps = { children?: ReactNode; className?: string };

export function Th({ children, className }: CellProps): JSX.Element {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-4 py-3 align-bottom font-strong text-ink-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: CellProps & { colSpan?: number }): JSX.Element {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-line-soft px-4 py-3 align-top break-words",
        className,
      )}
    >
      {children}
    </td>
  );
}
