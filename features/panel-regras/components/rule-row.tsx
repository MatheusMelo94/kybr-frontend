"use client";

import type { JSX, Ref } from "react";

import { Select } from "@/components/panel/select";
import { TextField } from "@/components/ui/text-field";
import { regrasCopy } from "@/features/panel-regras/copy";
import type { DraftRule } from "@/features/panel-regras/draft";
import { fill } from "@/features/panel-shell/format";
import type { PolicyAcao } from "@/lib/panel-api-values";

type Props = {
  regra: DraftRule;
  /** cnae's description: the category's own (regras.rule.cnae.desc). */
  descricaoCategoria: string;
  onAcao: (acao: PolicyAcao) => void;
  onDias: (dias: string) => void;
  /** regras.error.nodocs on this rule. */
  error?: string | undefined;
  /** regras.error.days on recente's days input. */
  daysError?: string | undefined;
  selectRef?: Ref<HTMLSelectElement> | undefined;
  daysRef?: Ref<HTMLInputElement> | undefined;
};

function title(regra: DraftRule): string {
  return fill(regrasCopy[`regras.rule.${regra.chave}`], {
    dias: regra.dias ?? "",
  });
}

/**
 * One rule (spec S11): its title as the select's label and its description
 * as the hint; the select offers only the rule's acoes_permitidas (O-F7);
 * recente also has the days input (regras.days.label, digits only).
 */
export function RuleRow({
  regra,
  descricaoCategoria,
  onAcao,
  onDias,
  error,
  daysError,
  selectRef,
  daysRef,
}: Props): JSX.Element {
  const hint =
    regra.chave === "ok"
      ? undefined
      : fill(regrasCopy[`regras.rule.${regra.chave}.desc`], {
          descricao_categoria: descricaoCategoria,
        });
  return (
    <li className="flex min-w-0 flex-col gap-3 border-t border-line pt-4">
      {regra.dias !== undefined && (
        <TextField
          {...(daysRef !== undefined && { ref: daysRef })}
          name="dias"
          label={regrasCopy["regras.days.label"]}
          inputMode="numeric"
          maxLength={4}
          value={regra.dias}
          {...(daysError !== undefined && { error: daysError })}
          onChange={(event) => onDias(event.target.value.replace(/\D/g, ""))}
          tabularNums
          className="max-w-48 min-w-0"
        />
      )}
      <Select
        {...(selectRef !== undefined && { ref: selectRef })}
        name={`acao-${regra.chave}`}
        label={title(regra)}
        {...(hint !== undefined && { hint })}
        error={error}
        value={regra.acao}
        onChange={(value) => onAcao(value as PolicyAcao)}
      >
        {regra.acoes_permitidas.map((acao) => (
          <option key={acao} value={acao}>
            {regrasCopy[`regras.action.${acao}`]}
          </option>
        ))}
      </Select>
    </li>
  );
}
