// Spec § Content & Copy › S12 Configurações, verbatim. The contact field
// reuses the onboarding keys (plan-m8 G7); the password errors reuse
// signup.error.password, auth.error.password_breached and the auth
// rate-limit copy (G6). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const settingsCopy = {
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
} as const;
