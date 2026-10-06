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
  // M6 (PC1, PC3, PC4): the Fila's seeded accounts.
  fila: "fila@exemplo.test",
  filavazia: "filavazia@exemplo.test",
  semwebhook: "semwebhook@exemplo.test",
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
  /** C-M6-3. The Fila counts add the account's cases in the store (QA G3). */
  fila_aguardando?: number;
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
  /** C-M6-4: the types Pedir documento offers (QA G10 sets them per account). */
  documentos_habilitados?: DocumentoTipo[];
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

// --- Cases (M6, contract-request.md D-C1–D-C6 + C-M6-1–C-M6-10, PC1–PC22) ----
// The mock stands in for the backend, so these sets are its own (not the
// frontend's lib/panel-api-values.ts): a drift between the two shows up as a
// schema failure in the tests, as it would against the real API.

export const DOCUMENTO_TIPOS = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "PROCURACAO",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
] as const;
export type DocumentoTipo = (typeof DOCUMENTO_TIPOS)[number];

/** C-M6-4's proposed default: every type but PROCURACAO. */
export const DEFAULT_DOCUMENTOS: readonly DocumentoTipo[] = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
];

export const MOTIVO_CODIGOS = [
  "SITUACAO_IRREGULAR",
  "RESPONSAVEL_NAO_SOCIO",
  "EMPRESA_RECENTE",
  "ATIVIDADE_FORA_DA_CATEGORIA",
  "IE_NAO_ENCONTRADA",
  "IE_SUSPENSA",
  "MEI",
  "GENERICO",
] as const;
export type MotivoCodigo = (typeof MOTIVO_CODIGOS)[number];

export type CaseEstado = "aberto" | "aguardando_doc" | "decidido";
export type CaseOrigem = "link" | "lote" | "monitoramento";
export type CaseStatus = "ok" | "warn" | "bad";
export type DecisaoTipo = "aprovar" | "manter" | "bloquear";

/** QA G8: a document of FOREIGN_CASE_ID (outro@): any other workspace gets 404. */
export const FOREIGN_DOC_ID = "8e2f6d3b-0c4a-4b7f-9d1e-2a3b4c5d6e7f";
/** FOREIGN_CASE_ID's verification (its certificate is another workspace's). */
export const FOREIGN_VERIFICATION_ID = "9f3a7e4c-1d5b-4c80-8e2f-3b4c5d6e7f80";

/** D-C1: the default page size, and C-M6-2's cap. */
export const CASE_PAGE_SIZE = 25;
export const CASE_LIMIT_MAX = 200;
/** C-M6-1: a `desde` older than this is 422. */
export const DESDE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** C-M6-8 (proposed): a waiting case's sla_ate is the request's deadline. */
export const DOC_REQUEST_DEADLINE_MS = 3 * 24 * 60 * 60_000;
/** A reopened case (documents back) is due in a day. */
export const REOPENED_SLA_MS = 24 * 60 * 60_000;

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export type CaseKind =
  | "link"
  | "link-sem-email"
  | "lote"
  | "lote-sem-qsa"
  | "alerta"
  | "nodata"
  | "decidido-aprovar"
  | "decidido-manter"
  | "decidido-bloquear"
  | "decidido-bloquear-sem-nota"
  | "decidido-com-documentos"
  | "aguardando"
  | "aguardando-sem-email"
  | "aguardando-alerta"
  | "hostil";

export const CASE_KINDS: readonly CaseKind[] = [
  "link",
  "link-sem-email",
  "lote",
  "lote-sem-qsa",
  "alerta",
  "nodata",
  "decidido-aprovar",
  "decidido-manter",
  "decidido-bloquear",
  "decidido-bloquear-sem-nota",
  "decidido-com-documentos",
  "aguardando",
  "aguardando-sem-email",
  "aguardando-alerta",
  "hostil",
];

export type CaseCheck = {
  chave: "situacao" | "qsa" | "idade" | "cnae" | "ie" | "regime";
  titulo: string;
  descricao: string;
  valor: string;
  status: CaseStatus;
};

export type CaseEventRecord = {
  tipo:
    | "caso_criado"
    | "documento_pedido"
    | "documento_recebido"
    | "decidido"
    | "reverificado";
  em: string;
  dados?: Record<string, unknown>;
};

export type CaseDocRecord = {
  id: string;
  tipo: DocumentoTipo;
  enviado_em: string;
  /** What /__docs serves for it (QA G9: PDF, JPEG and PNG). */
  formato: "pdf" | "jpeg" | "png";
};

/** One case in the mock (D-C2), with the mock's own bookkeeping. */
export type CaseRecord = {
  id: string;
  /** The owner's e-mail: another account's read is the same 404 (A-X3). */
  email: string;
  /** The factory kind, for the controls' listing (never on the wire). */
  kind: CaseKind;
  estado: CaseEstado;
  razao_social: string | null;
  cnpj: string;
  veredito: "aprovar" | "revisar" | "bloquear";
  status: CaseStatus;
  motivos: string[];
  origem: CaseOrigem;
  sla_ate: number;
  criado_em: number;
  /** C-M6-1: when it (re-)entered `aberto`, for `desde`. */
  abertoEm: number;
  seller: { id: string; razao_social: string | null; cnpj: string };
  verification: {
    id: string;
    modo: "cache" | "tempo_real";
    checagens: CaseCheck[];
    criado_em: number;
  };
  consultado_em?: number;
  mudanca?: {
    tipo: string;
    campo: string;
    de: string;
    para: string;
    detectado_em: number;
  };
  responsavel_informado?: string;
  ext_id?: string;
  vendedor_tem_email: boolean;
  variante?: "DADOS_NAO_ENCONTRADOS";
  decisao?: {
    tipo: DecisaoTipo;
    em: number;
    motivo_codigo?: MotivoCodigo;
    nota_vendedor?: string;
  };
  /** CR-P9: the open request's seller token (no e-mail), and the revoked ones. */
  linkToken?: string;
  revokedTokens: string[];
  eventos: CaseEventRecord[];
  documentos: CaseDocRecord[];
  /** QA G6: fields the contract doesn't have (F11: the schema must strip them). */
  extra?: Record<string, unknown>;
};

/** A synthetic, check-digit-valid wire CNPJ for case n (some alphanumeric). */
export function caseCnpj(n: number): string {
  const digits = String(n).padStart(4, "0");
  return cnpjWithRoot(
    n % 3 === 0 ? `CASO${digits}0001` : `${digits}${digits}0001`,
  );
}

const ISO = (ms: number): string => new Date(ms).toISOString();

const CHECKS_OK: readonly CaseCheck[] = [
  {
    chave: "situacao",
    titulo: "Situação na Receita",
    descricao: "A empresa está ativa.",
    valor: "ATIVA",
    status: "ok",
  },
  {
    chave: "qsa",
    titulo: "Responsável no QSA",
    descricao: "O responsável informado é sócio.",
    valor: "Sócio-administrador",
    status: "ok",
  },
  {
    chave: "idade",
    titulo: "Idade da empresa",
    descricao: "Aberta há mais de 2 anos.",
    valor: "6 anos",
    status: "ok",
  },
  {
    chave: "cnae",
    titulo: "Atividade (CNAE)",
    descricao: "Compatível com a categoria.",
    valor: "4781-4/00",
    status: "ok",
  },
  {
    chave: "ie",
    titulo: "Inscrição estadual",
    descricao: "Ativa no estado da sede.",
    valor: "Habilitada",
    status: "ok",
  },
  {
    chave: "regime",
    titulo: "Regime tributário",
    descricao: "Simples Nacional.",
    valor: "Simples",
    status: "ok",
  },
];

function checks(
  status: CaseStatus,
  overrides: Partial<Record<CaseCheck["chave"], Partial<CaseCheck>>> = {},
): CaseCheck[] {
  return CHECKS_OK.map((check, i) => ({
    ...check,
    ...(i === 3 &&
      status !== "ok" && {
        status,
        descricao: "Fora da categoria da plataforma.",
        valor: "9602-5/01",
      }),
    ...overrides[check.chave],
  }));
}

/**
 * A case of `kind` for `email`, numbered n, at the account's `now`. Open
 * cases are due `slaInMs` from now (negative: late). Synthetic data only.
 */
export function caseFor(
  kind: CaseKind,
  input: { email: string; n: number; now: number; slaInMs?: number },
): CaseRecord {
  const { email, n, now } = input;
  const cnpj = caseCnpj(n);
  const razao = `Empresa Exemplo ${n} Ltda`;
  const criado = now - 2 * DAY + n * 60_000;
  const status: CaseStatus = n % 4 === 0 ? "bad" : "warn";
  const base: CaseRecord = {
    id: crypto.randomUUID(),
    email,
    kind,
    estado: "aberto",
    razao_social: razao,
    cnpj,
    veredito: status === "bad" ? "bloquear" : "revisar",
    status,
    motivos:
      status === "bad"
        ? ["Situação inapta na Receita", "CNAE fora da categoria"]
        : ["CNAE fora da categoria"],
    origem: "link",
    sla_ate: now + (input.slaInMs ?? 6 * HOUR),
    criado_em: criado,
    abertoEm: criado,
    seller: { id: crypto.randomUUID(), razao_social: razao, cnpj },
    verification: {
      id: crypto.randomUUID(),
      modo: n % 5 === 0 ? "cache" : "tempo_real",
      checagens: checks(status),
      criado_em: criado,
    },
    consultado_em: criado,
    responsavel_informado: "Pessoa Exemplo",
    ext_id: `vendedor-${n}`,
    vendedor_tem_email: true,
    revokedTokens: [],
    eventos: [
      { tipo: "caso_criado", em: ISO(criado), dados: { origem: "link" } },
    ],
    documentos: [],
  };
  const created = (origem: CaseOrigem): CaseEventRecord => ({
    tipo: "caso_criado",
    em: ISO(criado),
    dados: { origem },
  });
  const requested = (at: number): CaseEventRecord => ({
    tipo: "documento_pedido",
    em: ISO(at),
    dados: { tipos: ["CARTAO_CNPJ", "CONTRATO_SOCIAL_OU_CCMEI"] },
  });
  const decided = (
    tipo: DecisaoTipo,
    extra: Partial<NonNullable<CaseRecord["decisao"]>> = {},
  ): Partial<CaseRecord> => ({
    estado: "decidido",
    decisao: { tipo, em: now - HOUR, ...extra },
    eventos: [
      ...base.eventos,
      { tipo: "decidido", em: ISO(now - HOUR), dados: { decisao: tipo } },
    ],
  });
  const alerta: Partial<CaseRecord> = {
    origem: "monitoramento",
    veredito: "revisar",
    status: "bad",
    motivos: ["Situação mudou para inapta"],
    mudanca: {
      tipo: "SITUACAO_CADASTRAL",
      campo: "Situação na Receita",
      de: "ATIVA",
      para: "INAPTA",
      detectado_em: now - DAY,
    },
    eventos: [created("monitoramento")],
  };
  const waiting = (semEmail: boolean): Partial<CaseRecord> => ({
    estado: "aguardando_doc",
    sla_ate: now - HOUR + DOC_REQUEST_DEADLINE_MS,
    vendedor_tem_email: !semEmail,
    ...(semEmail && { linkToken: randomToken(24) }),
    eventos: [...base.eventos, requested(now - HOUR)],
  });
  const doc = (tipo: DocumentoTipo, formato: CaseDocRecord["formato"]) => ({
    id: crypto.randomUUID(),
    tipo,
    enviado_em: ISO(now - 3 * HOUR),
    formato,
  });

  const patch: Partial<CaseRecord> = (() => {
    switch (kind) {
      case "link":
        return {};
      case "link-sem-email":
        return { vendedor_tem_email: false };
      case "lote":
        return {
          origem: "lote",
          vendedor_tem_email: false,
          eventos: [created("lote")],
        };
      case "lote-sem-qsa":
        // AC 30: no responsible person in the batch row (removed below).
        return {
          origem: "lote",
          vendedor_tem_email: false,
          verification: {
            ...base.verification,
            checagens: checks(status, {
              qsa: {
                status: "warn",
                descricao: "Sem responsável para conferir.",
                valor: "—",
              },
            }),
          },
          eventos: [created("lote")],
        };
      case "alerta":
        return alerta;
      case "nodata":
        return {
          razao_social: null,
          seller: { ...base.seller, razao_social: null },
          variante: "DADOS_NAO_ENCONTRADOS",
          veredito: "revisar",
          status: "warn",
          motivos: ["CNPJ sem registro na Receita"],
          verification: { ...base.verification, checagens: [] },
        };
      case "decidido-aprovar":
        return decided("aprovar");
      case "decidido-manter":
        return {
          ...alerta,
          ...decided("manter"),
          eventos: [
            created("monitoramento"),
            {
              tipo: "decidido",
              em: ISO(now - HOUR),
              dados: { decisao: "manter" },
            },
          ],
        };
      case "decidido-bloquear":
        return decided("bloquear", {
          motivo_codigo: "ATIVIDADE_FORA_DA_CATEGORIA",
          nota_vendedor: 'Atividade "fora" da categoria <b>de venda</b>.',
        });
      case "decidido-bloquear-sem-nota":
        return decided("bloquear", { motivo_codigo: "SITUACAO_IRREGULAR" });
      case "decidido-com-documentos":
        return {
          ...decided("aprovar"),
          documentos: [doc("CARTAO_CNPJ", "pdf")],
        };
      case "aguardando":
        return waiting(false);
      case "aguardando-sem-email":
        return waiting(true);
      case "aguardando-alerta":
        return {
          ...alerta,
          ...waiting(false),
          eventos: [created("monitoramento"), requested(now - HOUR)],
        };
      case "hostil":
        // QA G6: hostile and edge strings, and a field outside the contract.
        return {
          razao_social: HOSTILE_RAZAO,
          seller: { ...base.seller, razao_social: HOSTILE_RAZAO },
          motivos: [
            "Motivo um",
            "Motivo dois, com vírgula",
            "Motivo três",
            "Motivo quatro",
            "Motivo cinco",
            "Motivo seis",
          ],
          verification: {
            ...base.verification,
            checagens: checks("warn", {
              situacao: {
                titulo: "<b>Situação</b>",
                descricao: "<script>alert(1)</script>",
                valor: "<i>ATIVA</i>",
              },
            }),
          },
          mudanca: {
            tipo: "SITUACAO_CADASTRAL",
            campo: "Situação",
            de: `<b>${"a".repeat(117)}</b>`.slice(0, 120),
            para: `<img src=x>${"b".repeat(109)}`.slice(0, 120),
            detectado_em: now - DAY,
          },
          ext_id: "<script>",
          responsavel_informado: "x".repeat(200),
          documentos: [
            doc("CARTAO_CNPJ", "pdf"),
            doc("RESPONSAVEL", "jpeg"),
            doc("COMPROVANTE_ENDERECO", "png"),
          ],
          extra: { vendedor_email: "vendedor@exemplo.test" },
        };
    }
  })();
  const record = { ...base, ...patch };
  if (kind === "lote-sem-qsa") delete record.responsavel_informado;
  return record;
}

/** QA G6: the other hostile ext_ids and the long unbroken name, for per-test cases. */
export const HOSTILE_CASE_STRINGS = {
  extIds: ["<script>", "=1+1", "x".repeat(64)],
  longName: "A".repeat(200),
} as const;

/** QA G1: the presets a test seeds into its own account. */
export const CASE_PRESETS = [
  "pc1",
  "vazia",
  "um",
  "dois",
  "vinte-e-cinco",
  "vinte-e-seis",
  "duzentos-e-vinte",
  "tres-tardios-de-trinta",
  "cada-tipo",
  "limites",
  "hostil",
] as const;
export type CasePreset = (typeof CASE_PRESETS)[number];

const OPEN_KINDS: readonly CaseKind[] = [
  "link",
  "lote",
  "alerta",
  "link-sem-email",
  "lote-sem-qsa",
];

/** `count` open cases, `late` of them already past their SLA, oldest first. */
function openCases(
  email: string,
  now: number,
  count: number,
  late: number,
  from = 1,
): CaseRecord[] {
  return Array.from({ length: count }, (_, i) =>
    caseFor(OPEN_KINDS[i % OPEN_KINDS.length] ?? "link", {
      email,
      n: from + i,
      now,
      slaInMs: i < late ? -(late - i) * 6 * HOUR : (i - late + 1) * 2 * HOUR,
    }),
  );
}

/** The cases a preset seeds for `email` at `now` (PC1 = "pc1"). */
export function casesForPreset(
  preset: CasePreset,
  email: string,
  now: number,
): CaseRecord[] {
  switch (preset) {
    case "pc1": {
      // 30 open (4 late, one DADOS_NAO_ENCONTRADOS) + 3 waiting + 2 decided.
      const open = openCases(email, now, 30, 4);
      open[7] = caseFor("nodata", { email, n: 8, now, slaInMs: 8 * HOUR });
      return [
        ...open,
        caseFor("aguardando", { email, n: 31, now }),
        caseFor("aguardando-sem-email", { email, n: 32, now }),
        caseFor("aguardando-alerta", { email, n: 33, now }),
        caseFor("decidido-aprovar", { email, n: 34, now }),
        caseFor("decidido-bloquear", { email, n: 35, now }),
      ];
    }
    case "vazia":
      return [];
    case "um":
      return openCases(email, now, 1, 0);
    case "dois":
      return openCases(email, now, 2, 0);
    case "vinte-e-cinco":
      return openCases(email, now, 25, 0);
    case "vinte-e-seis":
      return openCases(email, now, 26, 0);
    case "duzentos-e-vinte":
      return openCases(email, now, 220, 0);
    case "tres-tardios-de-trinta":
      return openCases(email, now, 30, 3);
    case "cada-tipo":
      return CASE_KINDS.filter((kind) => kind !== "hostil").map((kind, i) =>
        caseFor(kind, { email, n: i + 1, now, slaInMs: (i + 1) * HOUR }),
      );
    case "limites": {
      // QA G4: SLA boundaries ("41 s", "3 min", "6 h", late "2 dias") and
      // dates around Brasília midnight, relative to the account's clock.
      const at = (n: number, slaInMs: number, criado?: number) => {
        const record = caseFor("link", { email, n, now, slaInMs });
        if (criado !== undefined) {
          record.criado_em = criado;
          record.abertoEm = criado;
          record.consultado_em = criado;
          record.verification.criado_em = criado;
          record.eventos = [
            { tipo: "caso_criado", em: ISO(criado), dados: { origem: "link" } },
          ];
        }
        return record;
      };
      const brasiliaMidnight = startOfBrasiliaDay(now);
      return [
        at(1, -2 * DAY),
        at(2, 41_000),
        at(3, 3 * 60_000),
        at(4, 6 * HOUR),
        // Yesterday 23:59 and today 00:30 in Brasília (−03:00).
        at(5, 8 * HOUR, brasiliaMidnight - 60_000),
        at(6, 9 * HOUR, brasiliaMidnight + 30 * 60_000),
        // 23:30 −03:00 the day before yesterday: "há 2 dias".
        at(7, 10 * HOUR, brasiliaMidnight - DAY - 30 * 60_000),
      ];
    }
    case "hostil":
      return [caseFor("hostil", { email, n: 1, now })];
  }
}

/** 00:00 in Brasília (UTC−3, no DST) of the day `now` falls on. */
export function startOfBrasiliaDay(now: number): number {
  const offset = 3 * HOUR;
  return Math.floor((now - offset) / DAY) * DAY + offset;
}

/** A batch row flagged warn/bad that Lote's to-queue turns into a case (QA G3). */
export function caseFromBatchRow(input: {
  email: string;
  n: number;
  now: number;
  cnpj: string;
  razao_social: string | null;
  status: "warn" | "bad";
  motivos: string[];
  responsavel?: string | undefined;
  ext_id?: string | undefined;
}): CaseRecord {
  const record = caseFor("lote", {
    email: input.email,
    n: input.n,
    now: input.now,
    slaInMs: DAY,
  });
  record.cnpj = input.cnpj;
  record.razao_social = input.razao_social;
  record.seller = {
    ...record.seller,
    cnpj: input.cnpj,
    razao_social: input.razao_social,
  };
  record.status = input.status;
  record.veredito = input.status === "bad" ? "bloquear" : "revisar";
  record.motivos = input.motivos;
  record.criado_em = input.now;
  record.abertoEm = input.now;
  record.eventos = [
    { tipo: "caso_criado", em: ISO(input.now), dados: { origem: "lote" } },
  ];
  if (input.responsavel === undefined) delete record.responsavel_informado;
  else record.responsavel_informado = input.responsavel;
  if (input.ext_id === undefined) delete record.ext_id;
  else record.ext_id = input.ext_id;
  return record;
}

/** The foreign case (outro@), with one document: A-X3's 404 targets (QA G8). */
export function foreignCase(now: number): CaseRecord {
  const record = caseFor("link", { email: PANEL_EMAILS.outro, n: 900, now });
  record.id = FOREIGN_CASE_ID;
  record.verification.id = FOREIGN_VERIFICATION_ID;
  record.documentos = [
    {
      id: FOREIGN_DOC_ID,
      tipo: "CARTAO_CNPJ",
      enviado_em: ISO(now - HOUR),
      formato: "pdf",
    },
  ];
  return record;
}

// Small, valid files for /__docs and the certificate (QA G9).
export const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
export const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
export const JPEG_BYTES = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  ),
);
