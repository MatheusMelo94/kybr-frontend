import {
  DEFAULT_DOCUMENTOS,
  FORMULA_RAZAO,
  HOME_NAMES,
  cnpjWithRoot,
  type CaseCheck,
  type DocumentoTipo,
} from "./panel.ts";

// M8b fixtures (contract-request.md § M8 additions C-M8-2–C-M8-6; QA's M8
// test plan PS1–PS10, PR1–PR5 and fixture gaps G1–G9). Synthetic data only.

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** PS4: a read-only account with no sellers (G1: tests seed their own). */
export const SELLER_EMAILS = { vazio: "vazio@exemplo.test" } as const;

/** QA G1: the presets a test seeds into its own account. */
export const SELLER_PRESETS = ["ps1", "vazio"] as const;
export type SellerPreset = (typeof SELLER_PRESETS)[number];

export const SELLER_STATUSES = [
  "aprovado",
  "revisao",
  "bloqueado",
  "mudou",
] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

/** C-M8-2: 50 per page. */
export const SELLER_PAGE_SIZE = 50;
/** PS1: three pages. */
export const PS1_COUNT = 120;
/** C-M8-2: `q` is at most 100 characters. */
export const SELLER_QUERY_MAX = 100;

export type SellerRecord = {
  id: string;
  /** The owner's e-mail: another account's read is the same 404 (A-X3). */
  email: string;
  /** PS1's index (1-based), for the tests' needles (never on the wire). */
  n: number;
  razao_social: string | null;
  cnpj: string;
  responsavel?: string;
  origem: "link" | "lote";
  verificado_em: number;
  status: SellerStatus;
  mudou?: { resumo: string };
  monitorado: boolean;
  reverificacao_pendente: boolean;
  verification: {
    id: string;
    modo: "cache" | "tempo_real";
    checagens: CaseCheck[];
    criado_em: number;
  };
  /** Newest first, the current one included (C-M8-3: ≤ 20 on the wire). */
  historico: {
    id: string;
    veredito: "aprovar" | "revisar" | "bloquear";
    criado_em: number;
  }[];
  case_aberto_id?: string;
};

/** QA G4: the PS1 names with a CPF, markup, a formula and 200 characters. */
export const SELLER_NAMES = {
  meiFormatted: HOME_NAMES.meiFormatted,
  meiBare: HOME_NAMES.meiBare,
  hostile: HOME_NAMES.hostile,
  formula: FORMULA_RAZAO,
  long: `Comércio ${"Exemplo ".repeat(30)}`.slice(0, 200),
} as const;

/** PS1's seller n: its name (n 1–5 are QA G4's, n 6 has none). */
function razaoFor(n: number): string | null {
  switch (n) {
    case 1:
      return SELLER_NAMES.meiFormatted;
    case 2:
      return SELLER_NAMES.meiBare;
    case 3:
      return SELLER_NAMES.hostile;
    case 4:
      return SELLER_NAMES.formula;
    case 5:
      return SELLER_NAMES.long;
    case 6:
      return null;
    default:
      return `Vendedor Exemplo ${n} Ltda`;
  }
}

/** A check-digit-valid wire CNPJ for seller n (every fifth alphanumeric). */
export function sellerCnpj(n: number): string {
  const digits = String(n).padStart(4, "0");
  return cnpjWithRoot(n % 5 === 0 ? `VEND${digits}0001` : `${digits}55660001`);
}

const STATUS_CYCLE: readonly SellerStatus[] = [
  "aprovado",
  "aprovado",
  "revisao",
  "bloqueado",
  "mudou",
];
const RESUMOS = ["inapta", "QSA mudou", "CNAE mudou", "baixada"] as const;

/** PS10: the seller with an open case (and a mudou the decision clears). */
export const PS10_N = 7;

const VEREDITO: Record<SellerStatus, "aprovar" | "revisar" | "bloquear"> = {
  aprovado: "aprovar",
  revisao: "revisar",
  bloqueado: "bloquear",
  mudou: "aprovar",
};

export function checksFor(status: SellerStatus): CaseCheck[] {
  const situacao = status === "bloqueado" || status === "mudou" ? "bad" : "ok";
  return [
    {
      chave: "situacao",
      titulo: "Situação na Receita",
      descricao:
        situacao === "ok" ? "A empresa está ativa." : "A empresa está inapta.",
      valor: situacao === "ok" ? "ATIVA" : "INAPTA",
      status: situacao,
    },
    {
      chave: "qsa",
      titulo: "Responsável no QSA",
      descricao: "O responsável informado é sócio.",
      valor: "Sócio-administrador",
      status: status === "revisao" ? "warn" : "ok",
    },
  ];
}

/** PS1's seller n for `email` at `now` (newest verification first by n). */
export function sellerFor(email: string, n: number, now: number): SellerRecord {
  const status: SellerStatus =
    n === PS10_N
      ? "mudou"
      : (STATUS_CYCLE[n % STATUS_CYCLE.length] ?? "aprovado");
  const verificado = now - n * 3 * HOUR;
  const verificationId = crypto.randomUUID();
  const history = Array.from({ length: n % 5 === 0 ? 3 : 1 }, (_, i) => ({
    id: i === 0 ? verificationId : crypto.randomUUID(),
    veredito: i === 0 ? VEREDITO[status] : ("aprovar" as const),
    criado_em: verificado - i * 30 * DAY,
  }));
  const responsavel =
    n === 4 ? "=1+1" : n % 7 === 3 ? undefined : `Responsável Exemplo ${n}`;
  return {
    id: crypto.randomUUID(),
    email,
    n,
    razao_social: razaoFor(n),
    cnpj: sellerCnpj(n),
    ...(responsavel !== undefined && { responsavel }),
    origem: n % 3 === 0 ? "lote" : "link",
    verificado_em: verificado,
    status,
    ...(status === "mudou" && {
      mudou: { resumo: RESUMOS[n % RESUMOS.length] ?? "inapta" },
    }),
    monitorado: n % 2 === 0,
    reverificacao_pendente: false,
    verification: {
      id: verificationId,
      modo: "cache",
      checagens: checksFor(status),
      criado_em: verificado,
    },
    historico: history,
  };
}

/** PS1 (120 sellers) or none, for `email` at `now`. */
export function sellersForPreset(
  preset: SellerPreset,
  email: string,
  now: number,
): SellerRecord[] {
  if (preset === "vazio") return [];
  return Array.from({ length: PS1_COUNT }, (_, i) =>
    sellerFor(email, i + 1, now),
  );
}

// --- Policy (D-R1, C-M8-6) -----------------------------------------------------

export const POLICY_ACOES = [
  "auto",
  "approve",
  "approve_limit",
  "review",
  "request",
  "block",
] as const;
export type PolicyAcao = (typeof POLICY_ACOES)[number];

export const POLICY_CHAVES = [
  "situacao",
  "recente",
  "qsa",
  "cnae",
  "ie",
  "mei",
  "ok",
] as const;
export type PolicyChave = (typeof POLICY_CHAVES)[number];

export type PolicyRule = {
  chave: PolicyChave;
  acao: PolicyAcao;
  acoes_permitidas: PolicyAcao[];
  dias?: number;
};

export type PolicyRecord = { versao: number; regras: PolicyRule[] };

/** PR1: the default policy (O-F7: each rule's own allowed actions). */
export function defaultPolicy(): PolicyRecord {
  return {
    versao: 1,
    regras: [
      {
        chave: "situacao",
        acao: "block",
        acoes_permitidas: ["review", "block"],
      },
      {
        chave: "recente",
        acao: "review",
        acoes_permitidas: ["approve", "review", "request", "block"],
        dias: 180,
      },
      {
        chave: "qsa",
        acao: "request",
        acoes_permitidas: ["approve", "review", "request", "block"],
      },
      {
        chave: "cnae",
        acao: "review",
        acoes_permitidas: ["approve", "approve_limit", "review", "block"],
      },
      {
        chave: "ie",
        acao: "approve_limit",
        acoes_permitidas: [
          "approve",
          "approve_limit",
          "review",
          "request",
          "block",
        ],
      },
      {
        chave: "mei",
        acao: "approve_limit",
        acoes_permitidas: ["approve", "approve_limit", "review"],
      },
      { chave: "ok", acao: "auto", acoes_permitidas: ["auto", "review"] },
    ],
  };
}

export const POLICY_DOCUMENTOS: readonly DocumentoTipo[] = DEFAULT_DOCUMENTOS;

// --- CSVs (D-S4, D-S5, C-M8-5) -------------------------------------------------

/** QA G3 / O-F5: the shared cap, and one byte over it. */
export const CSV_CAP_BYTES = 4 * 1024 * 1024;

/**
 * QA G3: a well-formed `;` CSV (BOM, two quoted columns, CRLF) of exactly
 * `bytes` UTF-8 bytes, so the handler's cap is tested at the byte.
 */
export function csvOfBytes(bytes: number): string {
  const header = '﻿"CNPJ";"Detalhe"\r\n';
  const headerBytes = new TextEncoder().encode(header).byteLength;
  const overhead = '"11.222.333/0001-81";""\r\n'.length;
  const rowBytes = 1_000;
  let rows = Math.floor((bytes - headerBytes) / rowBytes);
  let last = bytes - headerBytes - rows * rowBytes;
  if (last < overhead) {
    rows -= 1;
    last += rowBytes;
  }
  const row = (filler: number) =>
    `"11.222.333/0001-81";"${"a".repeat(filler)}"\r\n`;
  return header + row(rowBytes - overhead).repeat(rows) + row(last - overhead);
}

/** Audit actions (one row per type per month, QA G8). */
export const AUDIT_ACOES = [
  "Verificação",
  "Decisão: aprovar",
  "Decisão: bloquear",
  "Reverificação",
  "Regras salvas",
  "Exportação",
] as const;

/** QA G8: the audit seed spans 14 months back from `now`. */
export const AUDIT_MONTHS = 14;

export type AuditRow = {
  em: number;
  acao: string;
  vendedor: string;
  cnpj: string;
  detalhe: string;
};

/** QA G8: one row per action type per month, 14 months, newest first. */
export function auditRowsFor(now: number): AuditRow[] {
  const rows: AuditRow[] = [];
  for (let month = 0; month < AUDIT_MONTHS; month++)
    AUDIT_ACOES.forEach((acao, i) => {
      const n = month * AUDIT_ACOES.length + i + 1;
      rows.push({
        em: now - month * 30 * DAY - i * HOUR,
        acao,
        vendedor:
          n === 1
            ? SELLER_NAMES.meiFormatted
            : n === 2
              ? SELLER_NAMES.meiBare
              : `Vendedor Exemplo ${n} Ltda`,
        cnpj: sellerCnpj(n),
        detalhe: n === 3 ? SELLER_NAMES.formula : `Registro ${n}`,
      });
    });
  return rows;
}
