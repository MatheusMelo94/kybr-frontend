"use client";

import { useRef, useState, type FormEvent, type JSX } from "react";

import { CheckboxGroup } from "@/components/panel/checkbox-group";
import { Dialog } from "@/components/panel/dialog";
import { FormAlert } from "@/components/panel/form-alert";
import { TextArea } from "@/components/panel/text-area";
import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { NOTA_VENDEDOR_MAX } from "@/features/panel-fila/limits";
import { useDecisionFlow } from "@/features/panel-fila/use-decision-flow";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import { useNavigationGuard } from "@/lib/navigation/navigation-guard";
import type { DocumentoTipo } from "@/lib/panel-api-values";

type Props = {
  caseId: string;
  /** toast.requested's {razao_social}: the masked CNPJ when there is none (G3). */
  razao: string;
  /** /me's documentos_habilitados: exactly the types offered (C-M6-4). */
  tipos: readonly DocumentoTipo[];
  /** The case's vendedor_tem_email: the lead, and advance or stay (D11). */
  vendedorTemEmail: boolean;
};

/**
 * Pedir documento (AC 36, AC 37): a neutral trigger, then the dialog with the
 * enabled types, the optional note and the plural submit. Non-optimistic by
 * rule (F6), like Bloquear: nothing leaves the list until ok. Then, with a
 * seller e-mail, toast.requested and the next case (D5); without one, the
 * screen stays on the case for T109's link panel (D11). Failures stay in the
 * dialog with error.network and the values (D10, DOCUMENTO_NAO_HABILITADO
 * included); a 409 closes it on T106's conflict state.
 */
export function RequestDocumentsDialog({
  caseId,
  razao,
  tipos,
  vendedorTemEmail,
}: Props): JSX.Element {
  const { target, request, advance, conflict, unknown } = useDecisionFlow();
  const arm = useNavigationGuard();
  const expire = useSessionExpiry();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<DocumentoTipo[]>([]);
  const [nota, setNota] = useState("");
  const [noneError, setNoneError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstType = useRef<HTMLInputElement>(null);

  function close(): void {
    setOpen(false);
    setChecked([]);
    setNota("");
    setNoneError(false);
    setFailed(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (checked.length === 0) {
      setNoneError(true);
      firstType.current?.focus();
      return;
    }
    const guard = arm();
    const to = target(caseId);
    setBusy(true);
    setFailed(false);
    const result = await request({
      caseId,
      tipos: checked,
      ...(nota !== "" && { notaVendedor: nota }),
    });
    setBusy(false);
    const here = guard.stillHere();
    if (result.ok) {
      close();
      // D11: without an e-mail Renata stays to copy the link.
      advance(
        caseId,
        to,
        here && vendedorTemEmail,
        fill(filaCopy["toast.requested"], { razao_social: razao }),
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
      case "NETWORK":
        setFailed(true);
        unknown(here);
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
        onClick={() => setOpen(true)}
      >
        {filaCopy["fila.action.request"]}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={filaCopy["doc.h"]}
        closeLabel={globalCopy["common.close"]}
        busy={busy}
        dirty={checked.length > 0 || nota !== ""}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          <p className="text-body text-ink">
            {filaCopy[vendedorTemEmail ? "doc.lead" : "doc.noemail.lead"]}
          </p>
          <CheckboxGroup
            ref={firstType}
            legend={filaCopy["doc.types.legend"]}
            name="tipos"
            options={tipos.map((tipo) => ({
              value: tipo,
              label: filaCopy[`documento.${tipo}`],
            }))}
            values={checked}
            onChange={(values) => {
              setChecked(values as DocumentoTipo[]);
              setNoneError(false);
            }}
            error={noneError ? filaCopy["doc.error.none"] : undefined}
          />
          <TextArea
            label={filaCopy["doc.note.label"]}
            name="nota"
            hint={filaCopy["doc.note.hint"]}
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
              busyLabel={filaCopy["doc.submit.busy"]}
            >
              {checked.length > 1
                ? fill(filaCopy["doc.submit.other"], { n: checked.length })
                : filaCopy["doc.submit.one"]}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
