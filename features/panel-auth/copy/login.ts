// Ops panel spec v1.2 § Content & Copy, verbatim. S3 Entrar: login.*, plus the auth.* keys every auth form shares.
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const loginCopy = {
  "auth.error.password_breached":
    "Esta senha aparece em vazamentos de dados conhecidos. Escolha outra.",
  "auth.error.turnstile":
    "Não conseguimos fazer a verificação de segurança. Tente de novo.",
  "auth.error.turnstile.hint":
    "Se continuar, desative bloqueadores de anúncio para esta página ou tente em outra rede.",
  "login.h1": "Entrar no Kybr",
  "login.email.label": "E-mail",
  "login.password.label": "Senha",
  "login.submit": "Entrar",
  "login.submit.busy": "Entrando…",
  "login.forgot": "Esqueci minha senha",
  "login.signup": "Ainda não tem conta? Criar conta",
  "login.error.credentials": "E-mail ou senha incorretos.",
  "login.notice.unconfirmed": "Falta confirmar seu e-mail para entrar.",
  "login.error.turnstile_required":
    "Depois de algumas tentativas, pedimos uma verificação extra. Confira a senha e entre de novo.",
  "auth.error.rate_limit":
    "Muitas tentativas seguidas. Tente de novo em {minutos} min.",
  "auth.logout.done": "Você saiu do painel.",
} as const;
