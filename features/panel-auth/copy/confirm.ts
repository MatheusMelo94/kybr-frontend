// Ops panel spec v1.2 § Content & Copy, verbatim. S2 Confirmar e-mail: confirm.*.
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const confirmCopy = {
  "confirm.h1": "Confirme seu e-mail",
  "confirm.body":
    "Enviamos um código de 6 dígitos para {email}. Ele vale por {minutos} minutos.",
  "confirm.label": "Código",
  "confirm.submit": "Confirmar",
  "confirm.submit.busy": "Confirmando…",
  "confirm.resend": "Reenviar código",
  "confirm.resend.wait": "Reenviar em {segundos} s",
  "confirm.resent": "Código reenviado para {email}.",
  "confirm.back": "E-mail errado? Voltar",
  "confirm.error.wrong": "Código incorreto. Confira o e-mail e tente de novo.",
  "confirm.error.expired":
    'Este código não vale mais. Use "Reenviar código" para receber um novo.',
} as const;
