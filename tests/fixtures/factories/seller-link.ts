import { Faker, base, pt_BR } from "@faker-js/faker";

// Shared Pre-Contract fixtures for the seller link (QA-owned). Shapes follow
// docs/specs/seller-link-verification/contract-request.md (D1–D7, X1–X4).
// Synthetic data only: CNPJs are generated from made-up roots, names and
// addresses come from seeded faker, and every domain is under .test.
//
// Relative imports in tests/fixtures keep the .ts extension: `pnpm mock:api`
// runs these files with Node's built-in type stripping.

/** Scenarios reachable by CNPJ (lookup D2, verify D3, then the case D4). */
export type CnpjScenario =
  | "aprovado" // S4
  | "pendente" // S5
  | "bloqueado" // S6
  | "sem-dados" // S7
  | "limite-consulta" // S8
  | "limite-cnpj" // S9
  | "limite-geral" // S9
  | "lento" // S10
  | "aprovado-alfanumerico"; // S16

/** Every mocked error carries this `message`. It must never reach the screen (AC 36). */
export const ERROR_SENTINEL = "MSG-BACKEND-NAO-EXIBIR";

export const SLUGS = {
  ok: "loja-exemplo", // S1
  other: "outra-loja", // a second live link (URL contact); S11 slug mismatch
  unknown: "loja-inexistente", // S2
  unstable: "loja-instavel", // S3: 500 until recovered (POST /__mock/links/:slug/recover)
  noAutofill: "loja-sem-autofill", // S19: D2 kill switch, 503 AUTOFILL_DESATIVADO
  slow: "loja-lenta", // D1 answers like S1 after SLOW_LINK_DELAY_MS (skeleton tests)
  perTest: "loja-teste", // loja-teste-<suffix>: like S1, and disable-able per test
} as const;

/**
 * D1 delay for loja-lenta and loja-lenta-<suffix>. A per-test suffix lets each
 * parallel E2E project miss the Next server's 60 s D1 cache, and own its own
 * S3 toggle as loja-instavel-<suffix>.
 */
export const SLOW_LINK_DELAY_MS = 1_500;

/** True for `base` itself and for `base-<suffix>`. */
export function isSlugVariant(slug: string, base: string): boolean {
  return slug === base || slug.startsWith(`${base}-`);
}

/** Fixed case tokens (X3 pattern). Their cases exist as soon as the mock starts. */
export const CASE_TOKENS = {
  aprovado: "tokaprovado0000000000000", // S4
  pendente: "tokpendente0000000000000", // S5
  bloqueado: "tokbloqueado000000000000", // S6
  semDados: "toksemdados0000000000000", // S7: processing, no company data
  semDadosDocumento: "toksemdadosdoc0000000000", // S7: a document requested by Renata
  semDadosAprovado: "toksemdadosok00000000000", // S7: the same case approved
  allReceived: "tokrecebido0000000000000", // S14
  processing: "tokprocessando0000000000", // S10 held: processing, no result yet
  decided: "tokdecidido000000000000", // S15
  unknown: "tokdesconhecido00000000", // S11: never exists
  unstable: "tokinstavel000000000000", // S12: the read fails with 500
} as const;

/** Put one of these in an uploaded file's name to force that D6 outcome (S13). */
export const UPLOAD_MARKERS = {
  tooLarge: "__413__",
  badFormat: "__415__",
  decided: "__409__",
  rateLimited: "__429__",
  networkDrop: "__drop__",
} as const;

export const RETRY_AFTER_SECONDS = {
  lookup: 60,
  verify: 540,
  upload: 60,
} as const;

/** A case created through D3 stays `processing` this long, then shows its result. */
export const RESULT_AFTER_MS = 3_000;
/** S10: still processing past the 10 s switch, approved at about 14 s. */
export const SLOW_RESULT_AFTER_MS = 14_000;

/** When the fixed-token cases were created. Fixed, so screenshots stay stable. */
export const FIXED_CASE_CREATED_AT = "2026-10-01T12:00:00.000Z";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "PROCURACAO",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type PublicLink = {
  nome: string;
  contato_vendedor: { tipo: "email" | "url"; valor: string };
};

export const PUBLIC_LINKS: Readonly<Record<string, PublicLink>> = {
  [SLUGS.ok]: {
    nome: "Loja Exemplo",
    contato_vendedor: { tipo: "email", valor: "vendedores@loja-exemplo.test" },
  },
  [SLUGS.other]: {
    nome: "Outra Loja",
    contato_vendedor: { tipo: "url", valor: "https://outra-loja.test/ajuda" },
  },
  [SLUGS.noAutofill]: {
    nome: "Loja Sem Autofill",
    contato_vendedor: {
      tipo: "email",
      valor: "contato@loja-sem-autofill.test",
    },
  },
  [SLUGS.unstable]: {
    nome: "Loja Instável",
    contato_vendedor: { tipo: "email", valor: "contato@loja-instavel.test" },
  },
};

// --- CNPJ -------------------------------------------------------------------
// Wire format (contract X5): 14 uppercase alphanumerics, ^[0-9A-Z]{12}[0-9]{2}$.
// Spec v2 samples for S4–S6 and S16; made-up roots for the rest.

const CNPJ_ROOTS: Record<CnpjScenario, string> = {
  aprovado: "123456780001", // 12.345.678/0001-95
  pendente: "987654320001", // 98.765.432/0001-98
  bloqueado: "112223330001", // 11.222.333/0001-81
  "aprovado-alfanumerico": "12ABC34501DE", // 12.ABC.345/01DE-35 (Receita's example)
  "sem-dados": "714385620001",
  "limite-consulta": "825496730001",
  "limite-cnpj": "936517840001",
  "limite-geral": "147628950001",
  lento: "258739160001",
};

// A separate implementation from lib/cnpj.ts (pnpm mock:api runs under plain
// Node, without the @/ alias); a parity test keeps the two in agreement.
const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_WEIGHTS = [6, ...FIRST_WEIGHTS];

function checkDigit(characters: string, weights: number[]): number {
  // Each character is worth its ASCII code minus 48 (0–9 → 0–9, A → 17 … Z → 42).
  const sum = weights.reduce(
    (total, weight, index) =>
      total + (characters.charCodeAt(index) - 48) * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** The two check digits for the first 12 characters (Receita, IN RFB 2.229/2024). */
export function cnpjCheckDigits(first12: string): string {
  const first = checkDigit(first12, FIRST_WEIGHTS);
  const second = checkDigit(`${first12}${first}`, SECOND_WEIGHTS);
  return `${first}${second}`;
}

/** Strict wire-format check: what the mock accepts on D2 and D3. */
export function isValidCnpj(cnpj: string): boolean {
  return (
    /^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) &&
    !/^(.)\1{13}$/.test(cnpj) &&
    cnpjCheckDigits(cnpj.slice(0, 12)) === cnpj.slice(12)
  );
}

/** A check-digit-valid CNPJ in wire format (14 uppercase characters, unmasked). */
export function cnpjFor(scenario: CnpjScenario): string {
  const root = CNPJ_ROOTS[scenario];
  return `${root}${cnpjCheckDigits(root)}`;
}

/** The scenario a CNPJ belongs to. Any other valid CNPJ behaves like "aprovado". */
export function scenarioForCnpj(cnpj: string): CnpjScenario | undefined {
  return (Object.keys(CNPJ_ROOTS) as CnpjScenario[]).find(
    (scenario) => cnpjFor(scenario) === cnpj,
  );
}

// S18: MEI names carry the owner's CPF (synthetic). The mock masks it as the
// backend must (contract X7), except for one contract-violating variant that
// exercises the frontend backstop.
const MEI_ROOTS = { masked: "369258140001", unmasked: "471582630001" } as const;

/** S18 CNPJs, by how the mock returns the MEI name's CPF. */
export const MEI_CNPJS = {
  masked: `${MEI_ROOTS.masked}${cnpjCheckDigits(MEI_ROOTS.masked)}`,
  unmasked: `${MEI_ROOTS.unmasked}${cnpjCheckDigits(MEI_ROOTS.unmasked)}`,
} as const;

export const MEI_NAMES = {
  masked: "JOAO CARLOS SILVA ***.***.***-**",
  unmasked: "JOAO CARLOS SILVA 12345678909",
} as const;

// --- Seeded synthetic data ----------------------------------------------------

function fakerFor(key: string): Faker {
  const faker = new Faker({ locale: [pt_BR, base] });
  let seed = 0;
  for (const char of key) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  faker.seed(seed);
  return faker;
}

// A long razão social: two lines at 360 px and in the 480 px column. Sizes the
// company block's reserved height (review M1 v1 finding 0001).
const LONG_NAME_ROOT = "582936140001";

/** The CNPJ whose D2 razão social is LONG_RAZAO_SOCIAL. */
export const LONG_NAME_CNPJ = `${LONG_NAME_ROOT}${cnpjCheckDigits(LONG_NAME_ROOT)}`;

export const LONG_RAZAO_SOCIAL =
  "Comercial Exemplo de Peças Automotivas do Interior Ltda.";

/** D2 projection (U-E, contract D2): name, activity, city and state. No street address. */
export type Company = {
  razao_social: string;
  municipio: string;
  uf: string;
  cnae: { descricao: string };
};

/** D2 body for a CNPJ. The same CNPJ always gives the same company. */
export function buildCompany(cnpj: string): Company {
  const faker = fakerFor(`company:${cnpj}`);
  const fixedName =
    cnpj === MEI_CNPJS.masked
      ? MEI_NAMES.masked
      : cnpj === MEI_CNPJS.unmasked
        ? MEI_NAMES.unmasked
        : cnpj === LONG_NAME_CNPJ
          ? LONG_RAZAO_SOCIAL
          : undefined;
  return {
    razao_social: fixedName ?? `${faker.company.name()} Ltda.`,
    municipio: faker.location.city(),
    uf: faker.location.state({ abbreviated: true }),
    cnae: {
      descricao:
        "Comércio a varejo de peças e acessórios novos para veículos automotores",
    },
  };
}

/** A synthetic full name for fixed-token cases. */
export function buildResponsavel(key: string): string {
  return fakerFor(`person:${key}`).person.fullName();
}

/** "joao@empresa.com.br" → "j•••@empresa.com.br" (D4 email_contato_mascarado). */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

// --- Cases (D4) ---------------------------------------------------------------

/** How a case resolves. D3-created cases take it from the CNPJ scenario. */
export type CaseKind =
  | "aprovado"
  | "pendente"
  | "bloqueado"
  | "sem-dados"
  | "sem-dados-documento"
  | "sem-dados-aprovado"
  | "lento"
  | "processando"
  | "tudo-recebido"
  | "decidido";

export type UploadState = {
  files: number;
  bytes: number;
  format: "pdf" | "photos";
};

export type CaseRecord = {
  slug: string;
  kind: CaseKind;
  cnpj: string;
  responsavel: string;
  createdAt: number;
  /** Fixed-token cases skip the processing window. */
  settled: boolean;
  emailMasked?: string;
  uploads: Map<DocumentType, UploadState>;
};

export type PublicCase = {
  estado: "processing" | "pending" | "approved" | "blocked";
  criado_em: string;
  resultado?: Record<string, unknown>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The pending items for S5 / S14: not a partner, no IE, activity out of category, young company. */
function pendingItems(record: CaseRecord): Record<string, unknown>[] {
  return [
    {
      codigo: "DOCUMENTO_RESPONSAVEL",
      documento_tipo: "RESPONSAVEL",
      documentos_enviados: record.uploads.get("RESPONSAVEL")?.files ?? 0,
    },
    {
      codigo: "IE_NAO_ENCONTRADA",
      url_regularizacao:
        "https://portal.fazenda.sp.gov.br/exemplo-regularizar-ie",
    },
    { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
    { codigo: "EMPRESA_RECENTE", dias: 3 },
  ];
}

/** D4 body for a case at `now`. */
export function buildPublicCase(record: CaseRecord, now: number): PublicCase {
  const criado_em = new Date(record.createdAt).toISOString();
  const shared = {
    responsavel: record.responsavel,
    consultado_em: criado_em,
    ...(record.emailMasked !== undefined && {
      email_contato_mascarado: record.emailMasked,
    }),
  };

  // S7 (spec v3): no company data, so no razao_social and no consultado_em.
  const noData = {
    responsavel: record.responsavel,
    variante: "DADOS_NAO_ENCONTRADOS",
    ...(record.emailMasked !== undefined && {
      email_contato_mascarado: record.emailMasked,
    }),
  };
  switch (record.kind) {
    case "sem-dados":
      return { estado: "processing", criado_em, resultado: noData };
    case "sem-dados-documento":
      return {
        estado: "pending",
        criado_em,
        resultado: {
          ...noData,
          prazo_revisao: new Date(record.createdAt + 2 * DAY_MS).toISOString(),
          itens: [
            {
              codigo: "DOCUMENTO_SOLICITADO",
              documento_tipo: "CONTRATO_SOCIAL_OU_CCMEI",
              documentos_enviados:
                record.uploads.get("CONTRATO_SOCIAL_OU_CCMEI")?.files ?? 0,
            },
          ],
        },
      };
    case "sem-dados-aprovado":
      return { estado: "approved", criado_em, resultado: noData };
  }

  // Still processing, with no result yet, however long ago it was created.
  if (record.kind === "processando") return { estado: "processing", criado_em };

  const resultAfter =
    record.kind === "lento" ? SLOW_RESULT_AFTER_MS : RESULT_AFTER_MS;
  if (!record.settled && now - record.createdAt < resultAfter) {
    return { estado: "processing", criado_em };
  }

  const company = {
    razao_social: buildCompany(record.cnpj).razao_social,
    ...shared,
  };
  switch (record.kind) {
    case "aprovado":
    case "lento":
      return {
        estado: "approved",
        criado_em,
        resultado: {
          ...company,
          confirmacoes: [
            { codigo: "SITUACAO_ATIVA" },
            { codigo: "IE_ATIVA", uf: "SP" },
            { codigo: "RESPONSAVEL_CONFERE" },
          ],
        },
      };
    case "pendente":
    case "tudo-recebido":
      return {
        estado: "pending",
        criado_em,
        resultado: {
          ...company,
          prazo_revisao: new Date(record.createdAt + 2 * DAY_MS).toISOString(),
          itens: pendingItems(record),
        },
      };
    case "bloqueado":
      return {
        estado: "blocked",
        criado_em,
        resultado: {
          ...company,
          motivo: {
            codigo: "SITUACAO_IRREGULAR",
            situacao: "inapta",
            url_regularizacao:
              "https://www.gov.br/receitafederal/exemplo-regularizar-cnpj",
          },
        },
      };
    case "decidido":
      return {
        estado: "blocked",
        criado_em,
        resultado: { ...company, motivo: { codigo: "GENERICO" } },
      };
  }
}

/** The kind of case a D3 verify creates for a CNPJ. */
export function caseKindFor(cnpj: string): CaseKind {
  switch (scenarioForCnpj(cnpj)) {
    case "pendente":
      return "pendente";
    case "bloqueado":
      return "bloqueado";
    case "sem-dados":
      return "sem-dados";
    case "lento":
      return "lento";
    default:
      return "aprovado";
  }
}

/** The cases behind CASE_TOKENS, as they are when the mock starts. */
export function buildFixedCases(): Map<string, CaseRecord> {
  const createdAt = Date.parse(FIXED_CASE_CREATED_AT);
  const fixed = (
    kind: CaseKind,
    scenario: CnpjScenario,
    token: string,
  ): [string, CaseRecord] => [
    token,
    {
      slug: SLUGS.ok,
      kind,
      cnpj: cnpjFor(scenario),
      responsavel: buildResponsavel(token),
      createdAt,
      settled: true,
      uploads: new Map(),
    },
  ];
  const cases = new Map([
    fixed("aprovado", "aprovado", CASE_TOKENS.aprovado),
    fixed("pendente", "pendente", CASE_TOKENS.pendente),
    fixed("bloqueado", "bloqueado", CASE_TOKENS.bloqueado),
    fixed("sem-dados", "sem-dados", CASE_TOKENS.semDados),
    fixed("sem-dados-documento", "sem-dados", CASE_TOKENS.semDadosDocumento),
    fixed("sem-dados-aprovado", "sem-dados", CASE_TOKENS.semDadosAprovado),
    fixed("tudo-recebido", "pendente", CASE_TOKENS.allReceived),
    fixed("processando", "lento", CASE_TOKENS.processing),
    fixed("decidido", "pendente", CASE_TOKENS.decided),
  ]);
  cases
    .get(CASE_TOKENS.allReceived)
    ?.uploads.set("RESPONSAVEL", { files: 2, bytes: 2048, format: "photos" });
  return cases;
}
