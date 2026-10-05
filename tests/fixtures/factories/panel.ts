import { ERROR_SENTINEL } from "./seller-link.ts";

// Synthetic data for the panel's Pre-Contract mock (ops-panel
// contract-request.md § MSW handler contract, M4 scenarios PA1–PA19). Every
// e-mail is *@exemplo.test (or the disposable *@descartavel.test); nothing is
// real.

export { ERROR_SENTINEL };

/** The password of every seeded account (PA6, PA7, PA9–PA11). */
export const PANEL_PASSWORD = "senha-correta-123";

/** PA4: the backend's breach check refuses it (422 SENHA_FRACA). */
export const WEAK_PASSWORD = "senhasenhasenha";

/** PA16: any auth call carrying this password drops the connection. */
export const NETWORK_DROP_PASSWORD = "queda-de-rede";

/** Seconds in every 429's Retry-After (PA3): 9 minutes. */
export const PANEL_RETRY_AFTER_SECONDS = 540;

/** Seconds until "Reenviar código" (contract D-A1 reenviar_em). */
export const RESEND_AFTER_SECONDS = 60;

/** CR-P3: the code lives 10 minutes; 5 wrong attempts, then 429. */
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

/** PA17: failed logins before the API asks for Turnstile (428). */
export const FAILURES_BEFORE_TURNSTILE = 3;

/** P04: the reset token lives 1 h. */
export const RESET_TOKEN_TTL_MS = 60 * 60_000;

/** The absolute session lifetime (U-P6): 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

/** The sliding idle lifetime (U-P6): 12 hours. */
export const IDLE_TTL_MS = 12 * 60 * 60_000;

/** A case of the second workspace (outro@): any other workspace gets 404 (AC 73, P05; used from M6). */
export const FOREIGN_CASE_ID = "7d1e5c2a-9b3f-4a6e-8c0d-1f2a3b4c5d6e";

/** PA5: codes with a fixed answer. Any other wrong code is CODIGO_INCORRETO. */
export const CODES = {
  wrong: "000000",
  expired: "111111",
} as const;

/**
 * Turnstile (U-P2). Cloudflare's test site keys make the widget emit this
 * dummy token; the mock accepts it, as the backend would with its test
 * secret. `fail` stands in for a token siteverify rejects (PA18).
 */
export const TURNSTILE_TOKENS = {
  pass: "XXXX.DUMMY.TOKEN.XXXX",
  fail: "XXXX.DUMMY.TOKEN.FALHA",
} as const;

/** Cloudflare's test site keys (always passes / always fails). */
export const TURNSTILE_SITE_KEYS = {
  pass: "1x00000000000000000000AA",
  fail: "2x00000000000000000000AB",
} as const;

/** PA14: a reset token the API calls expired. */
export const EXPIRED_RESET_TOKEN = "tokexpirado0000000000000000000";

/** The seeded accounts, by scenario (PA2, PA3, PA6–PA11, PA14). */
export const PANEL_EMAILS = {
  renata: "renata@exemplo.test",
  nova: "nova@exemplo.test",
  pendente: "pendente@exemplo.test",
  parcial: "parcial@exemplo.test",
  esgotado: "esgotado@exemplo.test",
  pago: "pago@exemplo.test",
  existente: "existente@exemplo.test",
  limite: "limite@exemplo.test",
  ninguem: "ninguem@exemplo.test",
  outro: "outro@exemplo.test",
} as const;

/** PA19: sign-ups on this domain get no trial (403 TESTE_INDISPONIVEL). */
export const DISPOSABLE_DOMAIN = "descartavel.test";

export type Preset =
  | "renata"
  | "nova"
  | "pendente"
  | "parcial"
  | "esgotado"
  | "pago"
  | "tres-abertos"
  | "um-aberto"
  | "zerado"
  | "um-vendedor";

export const PRESETS: readonly Preset[] = [
  "renata",
  "nova",
  "pendente",
  "parcial",
  "esgotado",
  "pago",
  "tres-abertos",
  "um-aberto",
  "zerado",
  "um-vendedor",
];

export type Plano = {
  tipo: "teste" | "pago";
  nome?: string;
  usadas: number;
  limite: number;
  ciclo_ate?: string;
};

export type Contagens = {
  fila_abertos: number;
  fila_vencidos: number;
  alertas_criticos_abertos: number;
  vendedores: number;
  lote_em_andamento: boolean;
};

export type ContatoVendedor = { tipo: "email" | "url"; valor: string };

export type WorkspaceRecord = {
  nome: string;
  slug: string;
  contato_vendedor: ContatoVendedor | null;
  categoria: string | null;
  onboarding_concluido: boolean;
  webhook_configurado: boolean;
  plano?: Plano;
  contagens?: Contagens;
};

/** D-W2: the prototype's categories, with fixed ids. */
export const CATEGORIES = [
  {
    id: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e01",
    nome: "Lojas de peças",
    descricao: "Vendem peças e acessórios.",
  },
  {
    id: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e02",
    nome: "Oficinas e serviços",
    descricao: "Prestam serviços de manutenção.",
  },
  {
    id: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e03",
    nome: "Transportadoras",
    descricao: "Fazem coletas e entregas.",
  },
] as const;

const TRIAL: Plano = { tipo: "teste", usadas: 40, limite: 200 };
const COUNTS: Contagens = {
  fila_abertos: 7,
  fila_vencidos: 2,
  alertas_criticos_abertos: 1,
  vendedores: 1240,
  lote_em_andamento: false,
};
const ONBOARDED = {
  contato_vendedor: { tipo: "email", valor: "suporte@exemplo.test" },
  categoria: CATEGORIES[0].id,
  onboarding_concluido: true,
} as const;
const NOT_ONBOARDED = {
  contato_vendedor: null,
  categoria: null,
  onboarding_concluido: false,
} as const;

/** A synthetic slug for a workspace name ("Loja Exemplo" → "loja-exemplo-3f2a"). */
export function slugFor(nome: string, suffix: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "plataforma"}-${suffix}`;
}

/** The workspace each preset starts with. */
export function workspaceFor(preset: Preset, nome: string): WorkspaceRecord {
  const slug = slugFor(nome, preset.slice(0, 4));
  const common = { nome, slug, webhook_configurado: false };
  switch (preset) {
    case "renata":
      return { ...common, ...ONBOARDED, plano: TRIAL, contagens: COUNTS };
    case "nova":
    case "pendente":
      return { ...common, ...NOT_ONBOARDED, plano: { ...TRIAL, usadas: 0 } };
    case "parcial":
      // PA10: /me without contagens and plano (the shell hides both).
      return { ...common, ...ONBOARDED };
    case "esgotado":
      return {
        ...common,
        ...ONBOARDED,
        plano: { tipo: "teste", usadas: 200, limite: 200 },
        contagens: { ...COUNTS, fila_vencidos: 0 },
      };
    // QA G3: count edge cases for the shell.
    case "tres-abertos":
      return {
        ...common,
        ...ONBOARDED,
        plano: TRIAL,
        contagens: { ...COUNTS, fila_abertos: 3, fila_vencidos: 0 },
      };
    case "um-aberto":
      return {
        ...common,
        ...ONBOARDED,
        plano: TRIAL,
        contagens: { ...COUNTS, fila_abertos: 1, fila_vencidos: 0 },
      };
    case "zerado":
      return {
        ...common,
        ...ONBOARDED,
        plano: TRIAL,
        contagens: {
          fila_abertos: 0,
          fila_vencidos: 0,
          alertas_criticos_abertos: 0,
          vendedores: 0,
          lote_em_andamento: false,
        },
      };
    case "um-vendedor":
      return {
        ...common,
        ...ONBOARDED,
        plano: TRIAL,
        contagens: { ...COUNTS, vendedores: 1 },
      };
    case "pago":
      return {
        ...common,
        ...ONBOARDED,
        plano: {
          tipo: "pago",
          nome: "Essencial",
          usadas: 1240,
          limite: 5000,
          ciclo_ate: "2026-11-04T23:59:59-03:00",
        },
        contagens: { ...COUNTS, fila_vencidos: 0 },
      };
  }
}

/** A URL-safe random token of `bytes` bytes (sessions, tickets, reset tokens). */
export function randomToken(bytes = 24): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url",
  );
}

/** A 6-digit code that is never one of the fixed PA5 codes. */
export function randomCode(): string {
  for (;;) {
    const code = String(
      (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1_000_000,
    ).padStart(6, "0");
    if (code !== CODES.wrong && code !== CODES.expired) return code;
  }
}
