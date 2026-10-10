"use client";

import { useRef, useState, type FormEvent, type JSX } from "react";

import { DocToggles } from "@/features/panel-regras/components/doc-toggles";
import { RuleRow } from "@/features/panel-regras/components/rule-row";
import { SaveBar } from "@/features/panel-regras/components/save-bar";
import { regrasCopy } from "@/features/panel-regras/copy";
import {
  invalidDias,
  isDirty,
  nodocsOffenders,
  toDraft,
  type Draft,
  type DraftRule,
} from "@/features/panel-regras/draft";
import { fill } from "@/features/panel-shell/format";
import type { Policy } from "@/lib/api/schemas/panel/policies";

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
 * focus on the first); the Server Action re-checks both. No simulation
 * anywhere (Non-Goal 4).
 */
export function PolicyForm({ policy, categoria }: Props): JSX.Element {
  const [server] = useState(() => toDraft(policy));
  const [draft, setDraft] = useState<Draft>(server);
  const [checked, setChecked] = useState(false);
  const selects = useRef(new Map<string, HTMLSelectElement>());
  const days = useRef<HTMLInputElement>(null);
  const dirty = isDirty(draft, server);
  const offenders = checked ? nodocsOffenders(draft) : [];

  function updateRule(chave: DraftRule["chave"], change: Partial<DraftRule>) {
    setDraft((current) => ({
      ...current,
      regras: current.regras.map((regra) =>
        regra.chave === chave ? { ...regra, ...change } : regra,
      ),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (invalidDias(draft)) {
      days.current?.focus();
      return;
    }
    const [first] = nodocsOffenders(draft);
    if (first !== undefined) {
      setChecked(true);
      selects.current.get(first)?.focus();
      return;
    }
    // T145: savePolicyAction.
  }

  return (
    <form noValidate onSubmit={submit} className="flex min-w-0 flex-col gap-6">
      <p className="text-lead font-lead text-ink-muted">
        {fill(regrasCopy["regras.lead"], { categoria: categoria.nome })}
      </p>
      <ul className="flex flex-col gap-4">
        {draft.regras.map((regra) => (
          <RuleRow
            key={regra.chave}
            regra={regra}
            descricaoCategoria={categoria.descricao}
            onAcao={(acao) => updateRule(regra.chave, { acao })}
            onDias={(dias) => updateRule(regra.chave, { dias })}
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
      {dirty && (
        <SaveBar
          onDiscard={() => {
            setDraft(server);
            setChecked(false);
          }}
        />
      )}
    </form>
  );
}
