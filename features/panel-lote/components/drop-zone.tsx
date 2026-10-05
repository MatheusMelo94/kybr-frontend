"use client";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type Ref,
} from "react";

import { Button } from "@/components/ui/button";
import { loteCopy } from "@/features/panel-lote/copy";
import type { ParseError } from "@/features/panel-lote/parser/protocol";
import { cn } from "@/lib/utils";

export const FILE_ERROR_COPY: Record<ParseError, string> = {
  type: loteCopy["lote.error.type"],
  empty: loteCopy["lote.error.empty"],
  too_many: loteCopy["lote.error.too_many"],
  unreadable: loteCopy["lote.error.unreadable"],
};

type Props = {
  reading: boolean;
  error: ParseError | undefined;
  /** The first file only (QA Q7). */
  onFile: (file: File) => void;
  /** A dropped folder (QA Q7: lote.error.type). */
  onFolder: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

/**
 * S7's drop zone (AC 14, 15): a real button opens the file picker (WCAG
 * 2.5.7); dropping a file does the same, with its text and highlight on fine
 * pointers only. Reading and file errors show inside it, and it stays usable.
 */
export function DropZone({
  reading,
  error,
  onFile,
  onFolder,
  buttonRef,
}: Props): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const errorId = useId();

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    const item = event.dataTransfer.items?.[0];
    if (item?.webkitGetAsEntry?.()?.isDirectory) {
      onFolder();
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file !== undefined) onFile(file);
  }

  return (
    <div
      data-dragging={dragging ? "" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-line p-6",
        "pointer-fine:data-dragging:border-ink pointer-fine:data-dragging:bg-surface-raised",
      )}
    >
      <p className="hidden text-body font-strong text-ink pointer-fine:block">
        {loteCopy["lote.drop.title"]}
      </p>
      <p className="text-secondary text-ink-muted">
        {loteCopy["lote.drop.body"]}
      </p>
      <Button
        {...(buttonRef !== undefined && { ref: buttonRef })}
        variant="secondary"
        size="panel"
        onClick={() => input.current?.click()}
        {...(error !== undefined && { "aria-describedby": errorId })}
      >
        {loteCopy["lote.drop.cta"]}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,.xls"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset, so the same file can be picked again (and nothing lingers, C8).
          event.target.value = "";
          if (file !== undefined) onFile(file);
        }}
      />
      {reading && (
        <p className="text-body text-ink">{loteCopy["lote.reading"]}</p>
      )}
      {error !== undefined && !reading && (
        // An inline field error: DDR-0003's red-text exception.
        <p id={errorId} className="text-secondary text-danger-ink">
          {FILE_ERROR_COPY[error]}
        </p>
      )}
    </div>
  );
}
