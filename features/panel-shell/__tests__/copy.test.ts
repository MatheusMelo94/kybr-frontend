import { describe, expect, it } from "vitest";

import { confirmCopy } from "@/features/panel-auth/copy/confirm";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { signupCopy } from "@/features/panel-auth/copy/signup";
import { onboardingCopy } from "@/features/panel-onboarding/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";

const MODULES = {
  global: globalCopy,
  shell: shellCopy,
  signup: signupCopy,
  confirm: confirmCopy,
  login: loginCopy,
  reset: resetCopy,
  onboarding: onboardingCopy,
};

// Spec v1.2 § Content & Copy (Global, Auth, S4, S5, plus the Fila stub's
// fila.h1 / fila.lead), verbatim, grouped by the module that holds each key.
// Plural rows are split into .one / .other. Extracted from the spec tables.
const SPEC_DECK: Record<keyof typeof MODULES, Record<string, string>> = {
  global: {
    brand: "Kybr",
    "error.network":
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    "error.load.title": "Não carregou",
    "error.load.body": "Confira sua conexão e tente de novo.",
    "error.load.cta": "Tentar de novo",
    "offline.panel": "Sem conexão. Mostrando os dados de {hora}.",
    "offline.actions": "As decisões voltam quando a internet voltar.",
    "offline.back": "Conexão de volta. Dados atualizados.",
    "session.expired":
      "Sua sessão expirou. Entre de novo para continuar de onde parou.",
    "session.expired.lost": "O que estava aberto num formulário não foi salvo.",
    "copy.error":
      "Não conseguimos copiar. Selecione o link e copie manualmente.",
    "export.error": "Não conseguimos gerar o arquivo. Tente de novo.",
    "toast.link_copied": "Link copiado",
    "notfound.h1": "Página não encontrada",
    "notfound.body": "Este endereço não existe no painel.",
    "notfound.cta": "Ir para a fila",
    "fatal.h1": "Algo deu errado nesta tela",
    "fatal.body": "Tente de novo. Se continuar, volte para a fila.",
    "fatal.cta": "Tentar de novo",
    "common.cancel": "Cancelar",
    "common.close": "Fechar",
    "common.new_tab": "(abre em outra aba)",
  },
  shell: {
    "nav.label": "Navegação do painel",
    "nav.inicio": "Início",
    "nav.fila": "Fila de revisão",
    "nav.monitor": "Monitoramento",
    "nav.lote": "Verificar em lote",
    "nav.vendedores": "Vendedores",
    "nav.regras": "Regras",
    "nav.relatorio": "Relatório",
    "nav.integracoes": "Integrações",
    "nav.link": "Ver como vendedor",
    "nav.fila.count_sr.one": "{n} caso para decidir",
    "nav.fila.count_sr.other": "{n} casos para decidir",
    "nav.fila.count_sr_late.one": "{n} caso para decidir, fora do prazo",
    "nav.fila.count_sr_late.other": "{n} casos para decidir, {m} fora do prazo",
    "nav.fila.late.one": "{m} fora do prazo",
    "nav.fila.late.other": "{m} fora do prazo",
    "nav.monitor.count_sr.one": "{n} alerta crítico sem decisão",
    "nav.monitor.count_sr.other": "{n} alertas críticos sem decisão",
    "nav.lote.running": "Verificando",
    "ws.sellers.one": "{n} vendedor",
    "ws.sellers.other": "{n} vendedores",
    "account.menu": "Conta",
    "account.settings": "Configurações",
    "account.logout": "Sair",
    "plan.trial.title": "Teste grátis",
    "plan.trial.usage": "{usadas} de {limite} verificações",
    "plan.trial.cta": "Contratar",
    "plan.paid.title": "Plano {nome}",
    "plan.paid.usage": "{usadas} de {limite} verificações neste ciclo",
    "plan.paid.cycle": "Ciclo até {data}",
    "plan.exhausted":
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    "plan.none": "Esta conta ainda não tem verificações liberadas.",
    "plan.none.cta_hint": "Contrate para começar a verificar.",
    "fila.h1": "Fila de revisão",
    "fila.lead":
      "Casos que as regras não decidiram sozinhas. Mais antigo primeiro.",
  },
  signup: {
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
  },
  confirm: {
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
    "confirm.error.wrong":
      "Código incorreto. Confira o e-mail e tente de novo.",
    "confirm.error.expired":
      'Este código não vale mais. Use "Reenviar código" para receber um novo.',
  },
  login: {
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
  },
  reset: {
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
  },
  onboarding: {
    "onb.step": "Passo {n} de 2",
    "onb.h1": "Como os vendedores falam com vocês",
    "onb.lead":
      "Aparece no link de cadastro quando o vendedor precisa de ajuda.",
    "onb.contact.type.legend": "Canal de contato",
    "onb.contact.type.email": "E-mail",
    "onb.contact.type.url": "Página de ajuda",
    "onb.contact.email.label": "E-mail para vendedores",
    "onb.contact.url.label": "Endereço da página de ajuda",
    "onb.contact.url.hint": "Começa com https://",
    "onb.category.legend": "Que tipo de vendedor vocês cadastram?",
    "onb.category.hint":
      "Define as regras de aprovação. Dá para ajustar depois.",
    "onb.error.email": "Informe um e-mail válido.",
    "onb.error.url": "Informe um endereço que comece com https://.",
    "onb.error.category": "Escolha um tipo de vendedor.",
    "onb.submit": "Continuar",
    "onb.submit.busy": "Salvando…",
  },
};

describe("panel copy (T49)", () => {
  it.each(Object.keys(MODULES) as (keyof typeof MODULES)[])(
    "the %s module holds exactly the spec's keys, verbatim",
    (name) => {
      expect(MODULES[name]).toEqual(SPEC_DECK[name]);
    },
  );

  it("AC 72: no string addresses the user with a gendered form", () => {
    const all = Object.values(MODULES).flatMap((module) =>
      Object.values(module),
    );
    for (const text of all)
      expect(text).not.toMatch(/bem-vind|obrigad|você mesm/i);
  });

  it("has no placeholder copy left ([TBD], TODO)", () => {
    const all = Object.values(MODULES).flatMap((module) =>
      Object.values(module),
    );
    for (const text of all) expect(text).not.toMatch(/\[TBD|TODO/);
  });
});

describe("fill", () => {
  it("fills every placeholder, never by concatenation", () => {
    expect(fill(signupCopy["signup.password.hint"], { n: 12 })).toBe(
      "Pelo menos 12 caracteres.",
    );
    expect(
      fill(shellCopy["nav.fila.count_sr_late.other"], { n: 7, m: 2 }),
    ).toBe("7 casos para decidir, 2 fora do prazo");
  });

  it("leaves an unknown placeholder visible rather than inventing text", () => {
    expect(fill("{a} e {b}" as string, { a: "x" } as never)).toBe("x e {b}");
  });
});

describe("plural (Intl.PluralRules pt-BR)", () => {
  it.each([
    [1, "ws.sellers.one"],
    [0, "ws.sellers.one"],
    [2, "ws.sellers.other"],
    [1240, "ws.sellers.other"],
  ] as const)("n = %s picks %s", (n, key) => {
    expect(plural(shellCopy, "ws.sellers", n)).toBe(shellCopy[key]);
  });
});

describe("formatNumber", () => {
  it.each([
    [1240, "1.240"],
    [12, "12"],
    [1000000, "1.000.000"],
  ])("%s → %s", (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });
});
