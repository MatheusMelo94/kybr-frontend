import { ERROR_SENTINEL, cnpjCheckDigits } from "./seller-link.ts";

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
  | "um-vendedor"
  | "semverificacoes"
  | "cem";

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
  "semverificacoes",
  "cem",
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
    // PB15 / AC 18: 100 checks left.
    case "cem":
      return {
        ...common,
        ...ONBOARDED,
        plano: { tipo: "teste", usadas: 100, limite: 200 },
        contagens: { ...COUNTS, fila_vencidos: 0 },
      };
    // PB16 / AC 12: no checks granted (limite 0).
    case "semverificacoes":
      return {
        ...common,
        ...ONBOARDED,
        plano: { tipo: "teste", usadas: 0, limite: 0 },
        contagens: { ...COUNTS, fila_vencidos: 0 },
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

// --- Batches (M5, contract-request.md § MSW handler contract, PB1–PB18) -------

/** A check-digit-valid wire CNPJ from its first 12 characters. */
export function cnpjWithRoot(root: string): string {
  return `${root}${cnpjCheckDigits(root)}`;
}

/** `00.000.000/0000-00`, as a spreadsheet or the CSVs carry it (both formats). */
export function maskedCnpj(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export type BatchRowStatus = "ok" | "warn" | "bad" | "erro";
export type BatchTag = "inapta_baixada" | "sem_ie" | "cnae_fora";
export type BatchOutcome = {
  status: BatchRowStatus;
  razao_social?: string;
  motivos: string[];
  /** What the row counts toward in D-B2's motivos_contagem (C1). */
  tags: BatchTag[];
};

export type BatchLinha = {
  cnpj: string;
  responsavel?: string;
  ext_id?: string;
};

/** A spreadsheet row as the AC 16 file holds it (CNPJs masked or not). */
export type SheetRow = { cnpj: string; responsavel: string; ext_id: string };

const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elisa",
  "Fábio",
  "Gabriela",
  "Heitor",
];
const LAST_NAMES = ["Exemplo", "Teste", "Modelo", "Amostra"];

/** The AC 16 set's 184 distinct valid CNPJs: numeric ones start with 0 (a 13-digit number in Excel); every 4th is alphanumeric. */
function ac16Cnpj(index: number): string {
  const n = String(index).padStart(6, "0");
  return cnpjWithRoot(
    index % 4 === 3 ? `AB${n}0001` : `0${String(4_000_000 + index)}0001`,
  );
}

const MOTIVOS = {
  inapta: "Situação cadastral inapta na Receita",
  baixada: "Empresa baixada na Receita",
  sem_ie: "Sem inscrição estadual ativa",
  cnae: "CNAE principal fora da categoria",
} as const;

// The AC 16 set's outcomes by position (precedence erro > bad > warn > ok).
const AC16_ERRO = new Set([50, 120, 170]);
/** The one razão social that starts with a formula (CR-P8 / P08 escaping). */
export const FORMULA_RAZAO = '=HYPERLINK("http://exemplo.test")';

function ac16Outcome(index: number): BatchOutcome {
  if (AC16_ERRO.has(index)) return { status: "erro", motivos: [], tags: [] };
  const razao_social =
    index === 10 ? FORMULA_RAZAO : `Empresa Exemplo ${index + 1} Ltda`;
  if (index % 15 === 7)
    return index % 2 === 0
      ? {
          status: "bad",
          razao_social,
          motivos: [MOTIVOS.inapta],
          tags: ["inapta_baixada"],
        }
      : {
          status: "bad",
          razao_social,
          motivos: [MOTIVOS.baixada, MOTIVOS.cnae],
          tags: ["inapta_baixada", "cnae_fora"],
        };
  if (index % 9 === 4)
    return index % 2 === 0
      ? {
          status: "warn",
          razao_social,
          motivos: [MOTIVOS.sem_ie],
          tags: ["sem_ie"],
        }
      : {
          status: "warn",
          razao_social,
          motivos: [MOTIVOS.cnae],
          tags: ["cnae_fora"],
        };
  return { status: "ok", razao_social, motivos: [], tags: [] };
}

function ac16Linha(index: number): BatchLinha & SheetRow {
  return {
    cnpj: ac16Cnpj(index),
    responsavel: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`,
    ext_id: `loja-${String(index + 1).padStart(4, "0")}`,
  };
}

/**
 * The AC 16 set (spec AC 16): 190 file rows → 184 valid (numeric and
 * alphanumeric), 4 duplicates (every repeat after the first, each with another
 * responsável: the first wins), 2 invalid (a bad check digit, and an empty
 * CNPJ cell in a non-blank row). `linhas` is the payload the worker builds:
 * the 184, de-duplicated, in file order, in the wire format.
 */
export const AC16 = (() => {
  const linhas = Array.from({ length: 184 }, (_, index) => ac16Linha(index));
  const sheet = (linha: BatchLinha & SheetRow, index: number): SheetRow => ({
    // Every third CNPJ is masked, as people paste them.
    cnpj: index % 3 === 0 ? maskedCnpj(linha.cnpj) : linha.cnpj,
    responsavel: linha.responsavel,
    ext_id: linha.ext_id,
  });
  const duplicate = (index: number): SheetRow => ({
    cnpj: maskedCnpj(ac16Cnpj(index)),
    responsavel: "Outra Pessoa",
    ext_id: `dup-${index}`,
  });
  const extras: Record<number, SheetRow> = {
    30: duplicate(5),
    60: {
      cnpj: "04000999000100",
      responsavel: "Digito Errado",
      ext_id: "inv-1",
    },
    90: duplicate(17),
    120: { cnpj: "", responsavel: "Sem Cnpj", ext_id: "inv-2" },
    150: duplicate(40),
    183: duplicate(99),
  };
  const rows: SheetRow[] = [];
  linhas.forEach((linha, index) => {
    rows.push(sheet(linha, index));
    const extra = extras[index];
    if (extra) rows.push(extra);
  });
  return {
    rows,
    linhas: linhas.map(({ cnpj, responsavel, ext_id }) => ({
      cnpj,
      responsavel,
      ext_id,
    })),
  };
})();

const roots = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) =>
    cnpjWithRoot(`${prefix}${String(i + 1).padStart(12 - prefix.length, "0")}`),
  );

/**
 * PB4 / PB18 keys: a batch with FALHA stops halfway; TUDO-OK / TUDO-ERRO
 * sets. QA G5: misto-sem-erro (40 rows: 30 ok, 6 warn, 4 bad, no erro;
 * motivos_contagem 2 / 1 / 5) and um-atencao (3 ok + 1 warn) end
 * `concluido`. QA G7: hostil carries hostile backend strings.
 */
export const BATCH_SETS = {
  falha: cnpjWithRoot("FALHA0000001"),
  tudoOk: ["TUDOOK000001", "TUDOOK000002", "TUDOOK000003"].map(cnpjWithRoot),
  tudoErro: ["TUDOERRO0001", "TUDOERRO0002"].map(cnpjWithRoot),
  mistoSemErro: roots("MISTO", 40),
  umAtencao: roots("UMATENCAO", 4),
  hostil: roots("HOSTIL", 4),
} as const;

/** QA G7: the hostile razão social (rendered as text, never markup). */
export const HOSTILE_RAZAO = "<img src=x onerror=alert(1)>";
/** QA G7 / C9: ext_id values a spreadsheet would treat as formulas. */
export const HOSTILE_EXT_IDS = ["=1+1", "+x", "-x", "@x"] as const;

// G5: 4 bad + 6 warn with tags giving inapta_baixada 2, sem_ie 1, cnae_fora 5.
const MISTO: BatchOutcome[] = [
  { status: "bad", motivos: [MOTIVOS.inapta], tags: ["inapta_baixada"] },
  {
    status: "bad",
    motivos: [MOTIVOS.baixada, MOTIVOS.cnae],
    tags: ["inapta_baixada", "cnae_fora"],
  },
  { status: "bad", motivos: [MOTIVOS.cnae], tags: ["cnae_fora"] },
  { status: "bad", motivos: [MOTIVOS.cnae], tags: ["cnae_fora"] },
  { status: "warn", motivos: [MOTIVOS.sem_ie], tags: ["sem_ie"] },
  { status: "warn", motivos: [MOTIVOS.cnae], tags: ["cnae_fora"] },
  { status: "warn", motivos: [MOTIVOS.cnae], tags: ["cnae_fora"] },
  { status: "warn", motivos: ["Endereço divergente"], tags: [] },
  { status: "warn", motivos: ["Endereço divergente"], tags: [] },
  { status: "warn", motivos: ["Endereço divergente"], tags: [] },
];

// G7: hostile strings, as the backend may send them.
const HOSTIL: BatchOutcome[] = [
  {
    status: "warn",
    razao_social: HOSTILE_RAZAO,
    motivos: [
      "Motivo um",
      "Motivo dois, com vírgula",
      "Motivo três",
      "Motivo quatro",
      "Motivo cinco",
      "Motivo seis",
    ],
    tags: [],
  },
  {
    status: "ok",
    razao_social: `Empresa ${"Muito Longa ".repeat(20)}Ltda`.slice(0, 200),
    motivos: [],
    tags: [],
  },
  { status: "ok", motivos: [], tags: [] },
  {
    status: "ok",
    razao_social: "JOAO CARLOS SILVA ***.***.***-**",
    motivos: [],
    tags: [],
  },
];

/** QA G8: pago@exemplo.test's batch, seeded at mock boot (PB10's foreign id). */
export const FOREIGN_BATCH_ID = "f0e1d2c3-b4a5-4968-8a7b-6c5d4e3f2a10";

const ERRO: BatchOutcome = { status: "erro", motivos: [], tags: [] };
const OUTCOMES: ReadonlyMap<string, BatchOutcome> = new Map<
  string,
  BatchOutcome
>([
  ...AC16.linhas.map((linha, index): [string, BatchOutcome] => [
    linha.cnpj,
    ac16Outcome(index),
  ]),
  ...BATCH_SETS.tudoErro.map((cnpj): [string, BatchOutcome] => [cnpj, ERRO]),
  ...BATCH_SETS.mistoSemErro.map((cnpj, i): [string, BatchOutcome] => [
    cnpj,
    MISTO[i] ?? {
      status: "ok",
      razao_social: `Empresa Mista ${i + 1} Ltda`,
      motivos: [],
      tags: [],
    },
  ]),
  ...BATCH_SETS.umAtencao.map((cnpj, i): [string, BatchOutcome] => [
    cnpj,
    i === 0
      ? {
          status: "warn",
          razao_social: "Empresa Atenção Ltda",
          motivos: [MOTIVOS.sem_ie],
          tags: ["sem_ie"],
        }
      : {
          status: "ok",
          razao_social: `Empresa Certa ${i} Ltda`,
          motivos: [],
          tags: [],
        },
  ]),
  ...BATCH_SETS.hostil.map((cnpj, i): [string, BatchOutcome] => [
    cnpj,
    HOSTIL[i] ?? ERRO,
  ]),
]);

/** Each CNPJ's fixed outcome (PB3, PB18); any other CNPJ is ok. */
export function batchOutcomeFor(cnpj: string): BatchOutcome {
  return (
    OUTCOMES.get(cnpj) ?? {
      status: "ok",
      razao_social: "Empresa Exemplo Ltda",
      motivos: [],
      tags: [],
    }
  );
}

/** PB1: a status read advances ceil(total / 4); the clock gives this duration. */
export const BATCH_DURATION_MS = 41_000;
