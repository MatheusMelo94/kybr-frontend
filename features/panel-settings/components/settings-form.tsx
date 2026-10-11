"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";

import { FormAlert } from "@/components/panel/form-alert";
import { RadioGroup } from "@/components/panel/radio-group";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import { onboardingCopy } from "@/features/panel-onboarding/copy";
import type { ContactType } from "@/features/panel-onboarding/validation";
import {
  saveSettingsAction,
  type SaveSettingsResult,
} from "@/features/panel-settings/actions";
import { settingsCopy } from "@/features/panel-settings/copy";
import { SETTINGS_H1_ID } from "@/features/panel-settings/ids";
import {
  OWN_NAME_MAX_LENGTH,
  PLATFORM_NAME_MAX_LENGTH,
  settingsIssues,
  type SettingsField,
} from "@/features/panel-settings/validation";
import { useDialogDraft } from "@/features/panel-shell/components/session-expiry-provider";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

type Values = {
  nome_plataforma: string;
  tipo: ContactType;
  valor: string;
  nome: string;
};

type Props = {
  initial: {
    nome_plataforma: string;
    contato_vendedor: { tipo: ContactType; valor: string };
    nome: string;
    /** The login e-mail: shown, never edited here. */
    email: string;
  };
  /** The "Link de cadastro" section, between Plataforma and Conta. */
  link: ReactNode;
};

type Errors = Partial<Record<SettingsField, string>>;

const CONTACT_OPTIONS = [
  { value: "email", label: onboardingCopy["onb.contact.type.email"] },
  { value: "url", label: onboardingCopy["onb.contact.type.url"] },
] as const;

const SECTION = "flex min-w-0 flex-col gap-4";
const H2 = "text-h2 font-title text-ink";

const same = (a: Values, b: Values): boolean =>
  a.nome_plataforma === b.nome_plataforma &&
  a.tipo === b.tipo &&
  a.valor === b.valor &&
  a.nome === b.nome;

/**
 * S12 Configurações (AC 60, plan-m8 D4): the platform name and the seller
 * contact, then the own name, saved together by saveSettingsAction. The
 * save is enabled only when something changed and busy while saving;
 * success toasts toast.settings_saved, a failure shows error.network inline
 * and keeps the values. Field errors reuse the onboarding contact keys (G7)
 * and the sign-up name keys, with focus to the first. A dirty form counts
 * as a draft for the session-expiry return (perdido=1, AC 7).
 */
export function SettingsForm({ initial, link }: Props): JSX.Element {
  const toast = useToast();
  const expire = useSessionExpiry();
  const [saved, setSaved] = useState<Values>({
    nome_plataforma: initial.nome_plataforma,
    tipo: initial.contato_vendedor.tipo,
    valor: initial.contato_vendedor.valor,
    nome: initial.nome,
  });
  const [values, setValues] = useState<Values>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const inputs = {
    nome_plataforma: useRef<HTMLInputElement>(null),
    valor: useRef<HTMLInputElement>(null),
    nome: useRef<HTMLInputElement>(null),
  };
  const inFlight = useRef(false);
  const dirty = !same(values, saved);
  useDialogDraft(dirty);

  function showErrors(fields: SettingsField[], tipo: ContactType): void {
    setErrors({
      ...(fields.includes("nome_plataforma") && {
        nome_plataforma: signupCopy["signup.error.workspace"],
      }),
      ...(fields.includes("valor") && {
        valor:
          tipo === "email"
            ? onboardingCopy["onb.error.email"]
            : onboardingCopy["onb.error.url"],
      }),
      ...(fields.includes("nome") && { nome: signupCopy["signup.error.name"] }),
    });
    const first = fields[0];
    if (first !== undefined) inputs[first].current?.focus();
  }

  async function send(
    _previous: string | null,
    sent: Values,
  ): Promise<string | null> {
    let result: SaveSettingsResult;
    try {
      result = await saveSettingsAction({
        nome_plataforma: sent.nome_plataforma,
        contato_vendedor: { tipo: sent.tipo, valor: sent.valor },
        nome: sent.nome,
      });
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    inFlight.current = false;
    if (result.ok) {
      setSaved(sent);
      setValues(sent);
      toast.show(settingsCopy["toast.settings_saved"]);
      // P8-002: clean again, "Salvar alterações" is disabled under focus;
      // the h1 takes it (the toast announces the save), as on Regras.
      document.getElementById(SETTINGS_H1_ID)?.focus();
      return null;
    }
    switch (result.code) {
      case "INVALID":
        showErrors(result.fields, sent.tipo);
        return null;
      case "SESSAO_EXPIRADA":
        expire();
        return null;
      case "NETWORK":
      case "UNAVAILABLE":
        return globalCopy["error.network"];
    }
  }

  const [alert, dispatch, isPending] = useActionState(send, null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current || !dirty) return;
    const issues = settingsIssues(values);
    if (issues.length > 0) {
      showErrors(issues, values.tipo);
      return;
    }
    setErrors({});
    inFlight.current = true;
    const sent = {
      ...values,
      nome_plataforma: values.nome_plataforma.trim(),
      valor: values.valor.trim(),
      nome: values.nome.trim(),
    };
    startTransition(() => dispatch(sent));
  }

  function edit(field: keyof Values, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
    if (field !== "tipo")
      setErrors((previous) => {
        const next = { ...previous };
        delete next[field];
        return next;
      });
  }

  const contactLabel =
    values.tipo === "email"
      ? onboardingCopy["onb.contact.email.label"]
      : onboardingCopy["onb.contact.url.label"];

  return (
    <form
      action={() => {}}
      onSubmit={submit}
      noValidate
      aria-label={settingsCopy["settings.h1"]}
      className="flex min-w-0 flex-col gap-8"
    >
      <section aria-labelledby="settings-platform-h" className={SECTION}>
        <h2 id="settings-platform-h" className={H2}>
          {settingsCopy["settings.platform.h"]}
        </h2>
        <TextField
          ref={inputs.nome_plataforma}
          name="nome_plataforma"
          label={settingsCopy["settings.platform.name"]}
          hint={settingsCopy["settings.platform.name.hint"]}
          maxLength={PLATFORM_NAME_MAX_LENGTH}
          value={values.nome_plataforma}
          onChange={(event) => edit("nome_plataforma", event.target.value)}
          {...(errors.nome_plataforma !== undefined && {
            error: errors.nome_plataforma,
          })}
        />
        <RadioGroup
          name="tipo"
          legend={settingsCopy["settings.platform.contact"]}
          options={CONTACT_OPTIONS}
          value={values.tipo}
          onChange={(next) => {
            edit("tipo", next === "url" ? "url" : "email");
            edit("valor", "");
          }}
        />
        <TextField
          key={values.tipo}
          ref={inputs.valor}
          name="valor"
          label={contactLabel}
          autoCapitalize="none"
          spellCheck={false}
          {...(values.tipo === "email"
            ? { type: "email", inputMode: "email", autoComplete: "email" }
            : {
                inputMode: "text",
                autoComplete: "url",
                hint: onboardingCopy["onb.contact.url.hint"],
                maxLength: 2048,
              })}
          value={values.valor}
          onChange={(event) => edit("valor", event.target.value)}
          {...(errors.valor !== undefined && { error: errors.valor })}
        />
      </section>
      {link}
      <section aria-labelledby="settings-account-h" className={SECTION}>
        <h2 id="settings-account-h" className={H2}>
          {settingsCopy["settings.account.h"]}
        </h2>
        <TextField
          ref={inputs.nome}
          name="nome"
          label={settingsCopy["settings.account.name"]}
          autoComplete="name"
          maxLength={OWN_NAME_MAX_LENGTH}
          value={values.nome}
          onChange={(event) => edit("nome", event.target.value)}
          {...(errors.nome !== undefined && { error: errors.nome })}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-secondary font-strong text-ink">
            {settingsCopy["settings.account.email"]}
          </p>
          <p className="text-body break-words text-ink">{initial.email}</p>
          <p className="text-secondary text-ink-muted">
            {settingsCopy["settings.account.email.hint"]}
          </p>
        </div>
      </section>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button type="submit" size="panel" disabled={!dirty} busy={isPending}>
          {settingsCopy["settings.save"]}
        </Button>
        <FormAlert className="min-w-0">{alert}</FormAlert>
      </div>
    </form>
  );
}
