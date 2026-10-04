"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { RadioGroup } from "@/components/ui/radio-group";
import { TextField } from "@/components/ui/text-field";
import {
  saveOnboardingAction,
  type OnboardingResult,
} from "@/features/panel-onboarding/actions";
import { onboardingCopy } from "@/features/panel-onboarding/copy";
import {
  onboardingIssues,
  type ContactType,
  type OnboardingField,
} from "@/features/panel-onboarding/validation";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

type Errors = Partial<Record<OnboardingField, string>>;
type State = { alert: string | null; navigating: boolean };
const IDLE: State = { alert: null, navigating: false };

const CONTACT_OPTIONS = [
  { value: "email", label: onboardingCopy["onb.contact.type.email"] },
  { value: "url", label: onboardingCopy["onb.contact.type.url"] },
] as const;

type Props = {
  categories: readonly { id: string; nome: string; descricao: string }[];
};

/** S4 Começar: how sellers reach the platform, and the seller category (AC 4). */
export function OnboardingForm({ categories }: Props): JSX.Element {
  const router = useRouter();
  const expire = useSessionExpiry();
  const [tipo, setTipo] = useState<ContactType>("email");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const valorInput = useRef<HTMLInputElement>(null);
  const categoriaInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  function showErrors(fields: OnboardingField[], forTipo: ContactType): void {
    const valorError =
      forTipo === "email"
        ? onboardingCopy["onb.error.email"]
        : onboardingCopy["onb.error.url"];
    setErrors({
      ...(fields.includes("valor") && { valor: valorError }),
      ...(fields.includes("categoria") && {
        categoria: onboardingCopy["onb.error.category"],
      }),
    });
    (fields[0] === "valor" ? valorInput : categoriaInput).current?.focus();
  }

  async function send(
    _previous: State,
    payload: {
      contato_vendedor: { tipo: ContactType; valor: string };
      categoria: string;
    },
  ): Promise<State> {
    let result: OnboardingResult;
    try {
      result = await saveOnboardingAction(payload);
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    if (result.ok) {
      router.push(result.next);
      return { alert: null, navigating: true };
    }
    inFlight.current = false;
    switch (result.code) {
      case "INVALID":
        showErrors(result.fields, payload.contato_vendedor.tipo);
        return IDLE;
      case "SESSAO_EXPIRADA":
        expire();
        return { alert: null, navigating: true };
      case "NETWORK":
        return { alert: globalCopy["error.network"], navigating: false };
    }
  }

  const [state, dispatch, isPending] = useActionState(send, IDLE);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    const issues = onboardingIssues({ tipo, valor, categoria });
    if (issues.length > 0) {
      showErrors(issues, tipo);
      return;
    }
    setErrors({});
    inFlight.current = true;
    const payload = {
      contato_vendedor: { tipo, valor: valor.trim() },
      categoria,
    };
    startTransition(() => dispatch(payload));
  }

  function clear(field: OnboardingField): void {
    setErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  return (
    <form
      action={() => {}}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6"
    >
      <RadioGroup
        name="tipo"
        legend={onboardingCopy["onb.contact.type.legend"]}
        options={CONTACT_OPTIONS}
        value={tipo}
        onChange={(next) => {
          setTipo(next === "url" ? "url" : "email");
          setValor("");
          clear("valor");
        }}
      />
      {tipo === "email" ? (
        <TextField
          key="email"
          ref={valorInput}
          name="valor"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          label={onboardingCopy["onb.contact.email.label"]}
          value={valor}
          onChange={(event) => {
            setValor(event.target.value);
            clear("valor");
          }}
          {...(errors.valor !== undefined && { error: errors.valor })}
        />
      ) : (
        <TextField
          key="url"
          ref={valorInput}
          name="valor"
          inputMode="text"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          label={onboardingCopy["onb.contact.url.label"]}
          hint={onboardingCopy["onb.contact.url.hint"]}
          maxLength={2048}
          value={valor}
          onChange={(event) => {
            setValor(event.target.value);
            clear("valor");
          }}
          {...(errors.valor !== undefined && { error: errors.valor })}
        />
      )}
      <RadioGroup
        ref={categoriaInput}
        name="categoria"
        legend={onboardingCopy["onb.category.legend"]}
        hint={onboardingCopy["onb.category.hint"]}
        options={categories.map((category) => ({
          value: category.id,
          label: category.nome,
          description: category.descricao,
        }))}
        value={categoria}
        onChange={(next) => {
          setCategoria(next);
          clear("categoria");
        }}
        error={errors.categoria}
      />
      <div className="flex flex-col gap-3">
        <FormAlert>{state.alert}</FormAlert>
        <Button
          type="submit"
          size="panel"
          busy={isPending || state.navigating}
          busyLabel={onboardingCopy["onb.submit.busy"]}
          className="w-full"
        >
          {onboardingCopy["onb.submit"]}
        </Button>
      </div>
    </form>
  );
}
