// Ops panel spec v1.2 § Content & Copy, verbatim. S3 Recuperar senha / Nova senha: reset.*.
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const resetCopy = {
  "reset.h1": "Recuperar senha",
  "reset.lead":
    "Informe o e-mail da conta. Enviamos um link para criar uma senha nova.",
  "reset.submit": "Enviar link",
  "reset.submit.busy": "Enviando…",
  "reset.sent":
    "Se existir uma conta com {email}, o link chega em alguns minutos. Ele vale por {horas} h.",
  "reset.new.h1": "Criar senha nova",
  "reset.new.password.label": "Senha nova",
  "reset.new.submit": "Salvar senha",
  "reset.new.submit.busy": "Salvando…",
  "reset.done": "Senha alterada. Entre com a senha nova.",
  "reset.error.expired": "Este link expirou ou já foi usado.",
  "reset.error.expired.cta": "Pedir outro link",
} as const;
