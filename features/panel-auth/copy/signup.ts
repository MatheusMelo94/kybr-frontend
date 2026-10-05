// Ops panel spec v1.2 § Content & Copy, verbatim. S1 Cadastro: signup.*.
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const signupCopy = {
  "signup.h1": "Crie a conta da sua plataforma",
  "signup.lead":
    "Em poucos minutos você vê a situação dos vendedores que já tem.",
  "signup.name.label": "Seu nome",
  "signup.workspace.label": "Nome da plataforma",
  "signup.workspace.hint":
    "É o nome que os vendedores veem no link de cadastro.",
  "signup.email.label": "E-mail de trabalho",
  "signup.password.label": "Senha",
  "signup.password.hint": "Pelo menos {n} caracteres.",
  "signup.terms": "Li e aceito os {termos} e a {privacidade}.",
  "signup.terms.link_terms": "Termos de uso",
  "signup.terms.link_privacy": "Política de privacidade",
  "signup.submit": "Criar conta",
  "signup.submit.busy": "Criando conta…",
  "signup.login": "Já tem conta? Entrar",
  "signup.error.name": "Informe seu nome.",
  "signup.error.workspace": "Informe o nome da plataforma.",
  "signup.error.email": "Informe um e-mail válido, como nome@empresa.com.br.",
  "signup.error.password": "A senha precisa ter pelo menos {n} caracteres.",
  "signup.error.terms":
    "Para criar a conta, aceite os termos e a política de privacidade.",
  "signup.error.email_taken":
    "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
  "signup.error.trial_unavailable":
    "Não conseguimos liberar o teste grátis para este e-mail. Use seu e-mail de trabalho.",
  "signup.error.trial_unavailable.contact":
    "Para contratar direto, escreva para {email_comercial}.",
  "signup.error.trial_paused":
    "Os testes grátis estão pausados agora. Tente de novo mais tarde.",
} as const;
