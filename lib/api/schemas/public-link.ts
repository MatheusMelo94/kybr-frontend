import "server-only";

import { z } from "zod";

import { maskCpf } from "@/lib/cpf";
import { toSafeHttpsUrl, type SafeHttpsUrl } from "@/lib/safe-url";

// Response schemas for the seller link's public API (contract D1–D3). Server
// only, so they use regular zod (ADR-0003 rule 3). Unknown keys are stripped,
// so nothing beyond the projection reaches a component.

/**
 * A contact e-mail strict enough to become a mailto: safely: plain ASCII
 * local@domain, with no ?, &, #, %, spaces or control characters (threat
 * model § 6 item 3).
 */
const STRICT_EMAIL =
  /^[A-Za-z0-9._+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

const safeHttpsUrl = z.string().transform((value, ctx): SafeHttpsUrl => {
  const url = toSafeHttpsUrl(value);
  if (url === undefined) {
    ctx.addIssue({ code: "custom", message: "Not an https: URL" });
    return z.NEVER;
  }
  return url;
});

/** D1: the workspace name and the seller contact (contract X4). */
export const publicLinkSchema = z.object({
  nome: z.string().min(1),
  contato_vendedor: z.discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("email"),
      valor: z.string().max(254).regex(STRICT_EMAIL),
    }),
    z.object({ tipo: z.literal("url"), valor: safeHttpsUrl }),
  ]),
});

export type PublicLink = z.output<typeof publicLinkSchema>;

/**
 * D2: the U-E projection: business name, main activity, city and state. Never
 * a street address. Any CPF left in the name is masked here, as a backstop to
 * the backend's own masking (contract X7).
 */
export const companyLookupSchema = z.object({
  razao_social: z.string().min(1).transform(maskCpf),
  municipio: z.string().min(1),
  uf: z.string().regex(/^[A-Z]{2}$/),
  cnae: z.object({ descricao: z.string().min(1) }),
});

export type CompanyLookup = z.output<typeof companyLookupSchema>;

/** D3: an opaque case token (contract X3), checked before it can steer router.push. */
export const verificationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
});

// --- D4: the case --------------------------------------------------------------

/**
 * Logs what a D4 parse dropped or coerced, once, by shape: which part and the
 * issue paths and codes, never a value (§ Logging & Monitoring).
 */
function logDropped(
  part: string,
  issues: readonly Pick<z.core.$ZodIssue, "path" | "code">[] = [],
): void {
  console.error("[kybr-api] dropped from response", {
    operation: "getPublicCase",
    part,
    issues: issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
    })),
  });
}

/**
 * Parses each element on its own: an element that fails `schema` is dropped
 * and logged, never the whole response (unknown codes from a newer backend).
 */
function keepKnown<T extends z.ZodType>(part: string, schema: T) {
  return z.array(z.unknown()).transform((elements) =>
    elements.flatMap((element): z.output<T>[] => {
      const parsed = schema.safeParse(element);
      if (parsed.success) return [parsed.data];
      logDropped(part, parsed.error.issues);
      return [];
    }),
  );
}

function isGovBrHost(hostname: string): boolean {
  return hostname === "gov.br" || hostname.endsWith(".gov.br");
}

/**
 * An official regularization URL: https: on gov.br or *.gov.br only (threat
 * model F14, contract X4). Anything else is dropped, so the CTA isn't shown.
 */
const regularizationUrl = z
  .unknown()
  .transform((value): SafeHttpsUrl | undefined => {
    if (value === undefined) return undefined;
    const url = typeof value === "string" ? toSafeHttpsUrl(value) : undefined;
    if (url !== undefined && isGovBrHost(new URL(url).hostname)) return url;
    logDropped("url_regularizacao");
    return undefined;
  });

const SITUACOES = ["inapta", "suspensa", "baixada", "nula"] as const;

const DOCUMENT_TYPES = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "PROCURACAO",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
] as const;

const documentItem = {
  documento_tipo: z.enum(DOCUMENT_TYPES),
  documentos_enviados: z.number().int().min(0).default(0),
};

/**
 * A *quase lá* item, with exactly the fields its copy needs. An item missing
 * one (a document type, {situacao}, {dias}) is dropped like an unknown code,
 * so no row renders an empty placeholder.
 */
const pendingItemSchema = z.discriminatedUnion("codigo", [
  z.object({ codigo: z.literal("DOCUMENTO_RESPONSAVEL"), ...documentItem }),
  z.object({ codigo: z.literal("DOCUMENTO_SOLICITADO"), ...documentItem }),
  z.object({
    codigo: z.enum(["IE_NAO_ENCONTRADA", "IE_SUSPENSA"]),
    url_regularizacao: regularizationUrl.optional(),
  }),
  z.object({
    codigo: z.literal("SITUACAO_IRREGULAR"),
    situacao: z.enum(SITUACOES),
    url_regularizacao: regularizationUrl.optional(),
  }),
  z.object({
    codigo: z.literal("EMPRESA_RECENTE"),
    dias: z.number().int().min(1),
  }),
  z.object({ codigo: z.enum(["ATIVIDADE_FORA_DA_CATEGORIA", "MEI"]) }),
]);

export type PendingItem = z.output<typeof pendingItemSchema>;

/** An *tudo certo* confirmation row. The IE row needs its {uf}. */
const confirmationSchema = z.discriminatedUnion("codigo", [
  z.object({ codigo: z.enum(["SITUACAO_ATIVA", "RESPONSAVEL_CONFERE"]) }),
  z.object({
    codigo: z.literal("IE_ATIVA"),
    uf: z.string().regex(/^[A-Z]{2}$/),
  }),
]);

const knownMotivoSchema = z.discriminatedUnion("codigo", [
  z.object({
    codigo: z.literal("SITUACAO_IRREGULAR"),
    situacao: z.enum(SITUACOES),
    url_regularizacao: regularizationUrl.optional(),
  }),
  z.object({
    codigo: z.enum(["IE_NAO_ENCONTRADA", "IE_SUSPENSA"]),
    url_regularizacao: regularizationUrl.optional(),
  }),
  z.object({
    codigo: z.enum([
      "RESPONSAVEL_NAO_SOCIO",
      "EMPRESA_RECENTE",
      "ATIVIDADE_FORA_DA_CATEGORIA",
      "MEI",
      "GENERICO",
    ]),
  }),
]);

/** A *não aprovado* reason. An unknown or incomplete one becomes GENERICO. */
const motivoSchema = z
  .unknown()
  .transform((value): z.output<typeof knownMotivoSchema> => {
    const parsed = knownMotivoSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    logDropped("motivo", parsed.error.issues);
    return { codigo: "GENERICO" };
  });

export type BlockedReason = z.output<typeof knownMotivoSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

/**
 * The seller-facing `resultado` (spec v3 § Data Dependencies). `razao_social`
 * and `consultado_em` may be absent only with DADOS_NAO_ENCONTRADOS; otherwise
 * a missing one fails the parse (INVALID_RESPONSE). Any CPF left in the name
 * is masked, as on D2 (contract X7).
 */
const resultadoSchema = z
  .object({
    razao_social: z.string().min(1).transform(maskCpf).optional(),
    responsavel: z.string().min(1),
    consultado_em: isoDateTime.optional(),
    variante: z.literal("DADOS_NAO_ENCONTRADOS").optional(),
    prazo_revisao: isoDateTime.optional(),
    email_contato_mascarado: z.string().min(1).max(254).optional(),
    confirmacoes: keepKnown("confirmacoes", confirmationSchema).optional(),
    itens: keepKnown("itens", pendingItemSchema).optional(),
    motivo: motivoSchema.optional(),
  })
  .superRefine((resultado, ctx) => {
    if (resultado.variante !== undefined) return;
    for (const key of ["razao_social", "consultado_em"] as const) {
      if (resultado[key] === undefined)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Required without DADOS_NAO_ENCONTRADOS",
        });
    }
  });

/**
 * D4: the case's state, its creation time (for the 10 s switch) and, once
 * there is one, the seller-facing result. Unknown keys are stripped, so only
 * this projection exists past the boundary.
 */
export const publicCaseSchema = z
  .object({
    estado: z.enum(["processing", "pending", "approved", "blocked"]),
    criado_em: isoDateTime,
    resultado: resultadoSchema.optional(),
  })
  .superRefine((publicCase, ctx) => {
    if (publicCase.estado !== "processing" && !publicCase.resultado)
      ctx.addIssue({
        code: "custom",
        path: ["resultado"],
        message: "Required once the case has a result",
      });
    if (publicCase.estado === "pending" && !publicCase.resultado?.prazo_revisao)
      ctx.addIssue({
        code: "custom",
        path: ["resultado", "prazo_revisao"],
        message: "Required on pending",
      });
  });

export type PublicCase = z.output<typeof publicCaseSchema>;

/** A decided case's seller-facing result: what the result views render. */
export type CaseResult = NonNullable<PublicCase["resultado"]>;

export type Confirmation = NonNullable<CaseResult["confirmacoes"]>[number];
