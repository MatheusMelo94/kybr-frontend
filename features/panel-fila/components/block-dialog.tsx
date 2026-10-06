"use client";

import { useRef, useState, type FormEvent, type JSX } from "react";

import { Dialog } from "@/components/panel/dialog";
import { FormAlert } from "@/components/panel/form-alert";
import { RadioGroup } from "@/components/panel/radio-group";
import { TextArea } from "@/components/panel/text-area";
import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { NOTA_VENDEDOR_MAX } from "@/features/panel-fila/limits";
import { useDecisionFlow } from "@/features/panel-fila/use-decision-flow";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import { useNavigationGuard } from "@/lib/navigation/navigation-guard";
import { MOTIVO_CODIGOS, type MotivoCodigo } from "@/lib/panel-api-values";

type Props = {
  caseId: string;
  /** block.h's {razao_social}: the masked CNPJ when there is none (G3). */
  razao: string;
  /** /me's webhook_configurado: which lead the dialog shows. */
  webhook: boolean;
  /** Offline (T111): the trigger is disabled and described by offline.actions. */
  offline?: { disabled: true; describedBy: string } | undefined;
};

const REASONS = MOTIVO_CODIGOS.map((codigo) => ({
  value: codigo,
  label: filaCopy[`block.reason.${codigo}`],
}));

/**
 * Bloquear (AC 38): a neutral trigger, then the dialog with the reason, the
 * optional note and the ink-primary submit (DDR-0003 point 3). Non-optimistic by rule (F6): the case
 * stays in the list and the URL on /fila/{id} until ok; then the dialog
 * closes, toast.blocked shows and the next case opens (D5). Failures stay in
 * the dialog with error.network and the values (D10); a 409 closes it on
 * T106's conflict state. Cancelar and Esc discard the draft (Q9).
 */
export function BlockDialog({
  caseId,
  razao,
  webhook,
  offline,
}: Props): JSX.Element {
  const { target, call, advance, conflict, unknown } = useDecisionFlow();
  const arm = useNavigationGuard();
  const expire = useSessionExpiry();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCodigo | undefined>();
  const [nota, setNota] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstReason = useRef<HTMLInputElement>(null);

  function close(): void {
    setOpen(false);
    setMotivo(undefined);
    setNota("");
    setReasonError(false);
    setFailed(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (motivo === undefined) {
      setReasonError(true);
      firstReason.current?.focus();
      return;
    }
    const guard = arm();
    const to = target(caseId);
    setBusy(true);
    setFailed(false);
    const result = await call({
      caseId,
      decisao: "bloquear",
      motivoCodigo: motivo,
      ...(nota !== "" && { notaVendedor: nota }),
    });
    setBusy(false);
    const here = guard.stillHere();
    if (result.ok) {
      close();
      advance(
        caseId,
        to,
        here,
        fill(filaCopy["toast.blocked"], { razao_social: razao }),
      );
      return;
    }
    switch (result.code) {
      case "SESSAO_EXPIRADA":
        expire();
        return;
      case "CASO_JA_DECIDIDO":
        close();
        conflict(caseId, result.decididoEm, here);
        return;
      case "MOTIVO_OBRIGATORIO":
        setReasonError(true);
        firstReason.current?.focus();
        return;
      case "NETWORK":
      case "UNAVAILABLE":
        // Unknown outcomes (M6C-01): the key is kept, the case re-read.
        setFailed(true);
        unknown(result.code, here);
        return;
      default:
        setFailed(true);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="panel"
        disabled={offline?.disabled}
        aria-describedby={offline?.describedBy}
        onClick={() => setOpen(true)}
      >
        {filaCopy["fila.action.block"]}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={fill(filaCopy["block.h"], { razao_social: razao })}
        closeLabel={globalCopy["common.close"]}
        busy={busy}
        dirty={motivo !== undefined || nota !== ""}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          <p className="text-body text-ink">
            {filaCopy[webhook ? "block.lead.webhook" : "block.lead.nowebhook"]}
          </p>
          <RadioGroup
            ref={firstReason}
            legend={filaCopy["block.reason.legend"]}
            name="motivo"
            options={REASONS}
            // "" keeps the group controlled with nothing checked (Q9's reset).
            value={motivo ?? ""}
            onChange={(value) => {
              setMotivo(value as MotivoCodigo);
              setReasonError(false);
            }}
            error={reasonError ? filaCopy["block.error.reason"] : undefined}
          />
          <TextArea
            label={filaCopy["block.note.label"]}
            name="nota"
            hint={filaCopy["block.note.hint"]}
            maxLength={NOTA_VENDEDOR_MAX}
            value={nota}
            onChange={setNota}
          />
          <FormAlert>{failed && globalCopy["error.network"]}</FormAlert>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="panel"
              disabled={busy}
              onClick={close}
            >
              {globalCopy["common.cancel"]}
            </Button>
            <Button
              type="submit"
              size="panel"
              busy={busy}
              busyLabel={filaCopy["block.submit.busy"]}
            >
              {/* The ink primary with the explicit verb, never red: the
                  confirmation step carries the weight (DDR-0003 point 3). */}
              {filaCopy["block.submit"]}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
