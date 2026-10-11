"use client";

import { useRef, useState, type FormEvent, type JSX } from "react";

import { Dialog } from "@/components/panel/dialog";
import { FormAlert } from "@/components/panel/form-alert";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { callAction } from "@/features/panel-fila/call-action";
import { savePolicyAction } from "@/features/panel-regras/actions";
import { DocToggles } from "@/features/panel-regras/components/doc-toggles";
import { RuleRow } from "@/features/panel-regras/components/rule-row";
import { SaveBar } from "@/features/panel-regras/components/save-bar";
import { regrasCopy } from "@/features/panel-regras/copy";
import {
  draftInput,
  invalidDias,
  isDirty,
  nodocsOffenders,
  toDraft,
  type Draft,
  type DraftRule,
} from "@/features/panel-regras/draft";
import { REGRAS_H1_ID } from "@/features/panel-regras/ids";
import { useLeaveGuard } from "@/features/panel-regras/use-leave-guard";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import type { Policy } from "@/lib/api/schemas/panel/policies";
import {
  currentUrl,
  useNavigationGuard,
} from "@/lib/navigation/navigation-guard";
import { fullNavigate } from "@/lib/navigation/soft-navigate";

type Props = {
  policy: Policy;
  /** The workspace's category (O-08): the lead and cnae's description. */
  categoria: { nome: string; descricao: string };
};

const NODOCS_ID = "regras-nodocs";

/**
 * Regras (spec S11, AC 59, plan-m8 D8): a draft over the server policy in
 * local state only (O-F9). The save bar shows only while the draft differs;
 * Descartar restores the server copy. Saving first checks recente's days and
 * regras.error.nodocs (beside the documents card and each offending rule,
 * focus on the first); the Server Action re-checks both. Then one write
 * (savePolicyAction, the whole policy with versao): ok → toast.rules_saved
 * and the saved draft is the new server copy; a failure keeps the draft with
 * regras.save.error; a 409 is regras.save.conflict, never merged (O-F7): the
 * server copy loads only when Renata uses its reload. Leaving while dirty
 * asks regras.leave.* (useLeaveGuard). No simulation anywhere (Non-Goal 4).
 */
export function PolicyForm({ policy, categoria }: Props): JSX.Element {
  const [server, setServer] = useState(() => toDraft(policy));
  const [draft, setDraft] = useState<Draft>(server);
  const [checked, setChecked] = useState(false);
  const [daysChecked, setDaysChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"error" | "conflict" | null>(null);
  const { show } = useToast();
  const expire = useSessionExpiry();
  const arm = useNavigationGuard();
  const selects = useRef(new Map<string, HTMLSelectElement>());
  const days = useRef<HTMLInputElement>(null);
  const dirty = isDirty(draft, server);
  const offenders = checked ? nodocsOffenders(draft) : [];
  const guard = useLeaveGuard(dirty);

  function updateRule(chave: DraftRule["chave"], change: Partial<DraftRule>) {
    setDraft((current) => ({
      ...current,
      regras: current.regras.map((regra) =>
        regra.chave === chave ? { ...regra, ...change } : regra,
      ),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (invalidDias(draft)) {
      setDaysChecked(true);
      days.current?.focus();
      return;
    }
    const [first] = nodocsOffenders(draft);
    if (first !== undefined) {
      setChecked(true);
      selects.current.get(first)?.focus();
      return;
    }
    const here = arm();
    setBusy(true);
    setFailure(null);
    const saving = draft;
    const result = await callAction(savePolicyAction, draftInput(saving));
    setBusy(false);
    if (result.ok) {
      const saved = { ...saving, versao: result.versao };
      setServer(saved);
      setDraft(saved);
      setChecked(false);
      show(regrasCopy["toast.rules_saved"]);
      // The bar (and its button) unmounts: the heading takes focus.
      if (here.stillHere()) document.getElementById(REGRAS_H1_ID)?.focus();
      return;
    }
    if (result.code === "SESSAO_EXPIRADA") {
      // The expiry's full load must not stop at beforeunload (perdido=1
      // already tells Renata the draft is gone).
      guard.disarm();
      expire();
    } else
      setFailure(
        result.code === "POLITICA_DESATUALIZADA" ? "conflict" : "error",
      );
  }

  function reload(): void {
    guard.disarm();
    fullNavigate(currentUrl());
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-6 [overflow-wrap:anywhere]"
    >
      <p className="text-lead font-lead break-words text-ink-muted">
        {fill(regrasCopy["regras.lead"], { categoria: categoria.nome })}
      </p>
      {/* P8-004: locked while a save is in flight, so no edit is replaced
          by the saved snapshot unseen. A disabled fieldset disables every
          native control in it, the switches' buttons included. */}
      <fieldset
        disabled={busy}
        className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0"
      >
        <ul className="flex flex-col gap-4">
          {draft.regras.map((regra) => (
            <RuleRow
              key={regra.chave}
              regra={regra}
              descricaoCategoria={categoria.descricao}
              onAcao={(acao) => updateRule(regra.chave, { acao })}
              onDias={(dias) => updateRule(regra.chave, { dias })}
              daysError={
                daysChecked && invalidDias(draft)
                  ? regrasCopy["regras.error.days"]
                  : undefined
              }
              error={
                offenders.includes(regra.chave)
                  ? regrasCopy["regras.error.nodocs"]
                  : undefined
              }
              selectRef={(element) => {
                if (element) selects.current.set(regra.chave, element);
                else selects.current.delete(regra.chave);
              }}
              {...(regra.dias !== undefined && { daysRef: days })}
            />
          ))}
        </ul>
        <DocToggles
          enabled={draft.documentos}
          onToggle={(tipo, on) =>
            setDraft((current) => ({
              ...current,
              documentos: on
                ? [...current.documentos, tipo]
                : current.documentos.filter((item) => item !== tipo),
            }))
          }
          error={
            offenders.length > 0
              ? { id: NODOCS_ID, text: regrasCopy["regras.error.nodocs"] }
              : undefined
          }
        />
      </fieldset>
      {dirty && (
        <SaveBar
          busy={busy}
          onDiscard={() => {
            setDraft(server);
            setChecked(false);
            setFailure(null);
            // P8-002: the bar (and the focused Descartar) unmounts.
            document.getElementById(REGRAS_H1_ID)?.focus();
          }}
          alert={
            <FormAlert className="basis-full">
              {failure === "error" && regrasCopy["regras.save.error"]}
              {failure === "conflict" && (
                // O-F7: the server copy reloads only when Renata acts.
                <button
                  type="button"
                  onClick={reload}
                  className="text-left underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {regrasCopy["regras.save.conflict"]}
                </button>
              )}
            </FormAlert>
          }
        />
      )}
      <Dialog
        open={guard.pending !== null}
        onClose={guard.stay}
        title={regrasCopy["regras.leave.h"]}
        closeLabel={globalCopy["common.close"]}
      >
        <div className="flex flex-col gap-6">
          <p className="text-body text-ink">
            {regrasCopy["regras.leave.body"]}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="panel"
              onClick={guard.stay}
            >
              {regrasCopy["regras.leave.stay"]}
            </Button>
            <Button type="button" size="panel" onClick={guard.leave}>
              {regrasCopy["regras.leave.confirm"]}
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}
