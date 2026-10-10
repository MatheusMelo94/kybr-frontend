import { describe, expect, it } from "vitest";

import { onboardingCopy } from "@/features/panel-onboarding/copy";
import { settingsCopy } from "@/features/panel-settings/copy";

// Spec § Content & Copy › S12 Configurações, verbatim. The contact field
// reuses the onboarding keys (plan-m8 G7) and the password errors reuse the
// sign-up/login keys (G6), so neither is copied here.
const SPEC_S12: Record<string, string> = {
  "settings.h1": "Configurações",
  "settings.platform.h": "Plataforma",
  "settings.platform.name": "Nome da plataforma",
  "settings.platform.name.hint": "Aparece no link de cadastro.",
  "settings.platform.contact": "Contato para vendedores",
  "settings.link.h": "Link de cadastro",
  "settings.link.copy": "Copiar",
  "settings.account.h": "Conta",
  "settings.account.name": "Seu nome",
  "settings.account.email": "E-mail de login",
  "settings.account.email.hint":
    "Para trocar o e-mail de login, fale com a gente.",
  "settings.save": "Salvar alterações",
  "toast.settings_saved": "Alterações salvas",
  "pwd.h": "Trocar senha",
  "pwd.current": "Senha atual",
  "pwd.new": "Senha nova",
  "pwd.submit": "Trocar senha",
  "pwd.error.current": "A senha atual não confere.",
  "toast.password_changed": "Senha trocada",
};

describe("settingsCopy (T128, spec § Content & Copy › S12)", () => {
  it("holds every S12 key, verbatim, and nothing else", () => {
    expect(settingsCopy).toEqual(SPEC_S12);
  });

  it("has no TODO(copy) placeholder", () => {
    for (const value of Object.values(settingsCopy))
      expect(value).not.toContain("TODO");
  });

  it("G7: the contact keys stay in the onboarding copy", () => {
    expect(onboardingCopy["onb.contact.email.label"]).toBeTruthy();
    expect(onboardingCopy["onb.contact.url.hint"]).toBe("Começa com https://");
  });
});
