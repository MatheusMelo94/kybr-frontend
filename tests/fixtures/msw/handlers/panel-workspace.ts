import { delay, http, type RequestHandler } from "msw";

import {
  CATEGORIES,
  DEFAULT_DOCUMENTOS,
  type ContatoVendedor,
} from "../../factories/panel.ts";
import {
  alertCount,
  caseCounts,
  hasRunningBatch,
  takeFault,
  scenarioApplies,
  sessionAccount,
  type Account,
} from "../panel-store.ts";
import { apiError, incoming, networkDrop, ok } from "./panel-common.ts";
import { homeAuthed } from "./panel-home.ts";

// Pre-Contract handlers for D-W1–D-W3 (ops-panel contract-request.md, M4)
// and D-W4 + the D-W3 name (C-M8-8, M8a).

const PLAIN_EMAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;
const NAME_MAX = 80; // D-W3 nome and D-W4 (C-M8-8)

/** A trimmed 1..80 name, or undefined. */
function nameFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const nome = value.trim();
  return nome.length >= 1 && nome.length <= NAME_MAX ? nome : undefined;
}

function workspaceView(account: Account): Record<string, unknown> {
  const { plano, ...workspace } = account.workspace;
  // QA G3: the counts fail alone (the shell hides them), until unseeded.
  const stored = scenarioApplies("contagens-falham", account.email)
    ? undefined
    : account.workspace.contagens;
  // PB17: true while a batch of this workspace is processando. QA G3: the
  // Fila counts add the account's cases in the store to the static ones.
  const cases = caseCounts(account.email);
  const contagens = stored && {
    ...stored,
    fila_abertos: stored.fila_abertos + cases.abertos,
    fila_vencidos: stored.fila_vencidos + cases.vencidos,
    fila_aguardando: (stored.fila_aguardando ?? 0) + cases.aguardando,
    lote_em_andamento: hasRunningBatch(account.email),
    // C-M7-4 / QA G7: derived from the alerts store once M7 seeded the account.
    alertas_criticos_abertos:
      alertCount(account.email) ?? stored.alertas_criticos_abertos,
  };
  delete (workspace as { contagens?: unknown }).contagens;
  return {
    ...workspace,
    link_url: `https://kybr.com.br/v/${workspace.slug}`,
    ...(plano && { plano }),
    ...(contagens && { contagens }),
    // C-M6-4: the default four until a test sets them (QA G10).
    documentos_habilitados: [
      ...(account.workspace.documentos_habilitados ?? DEFAULT_DOCUMENTOS),
    ],
  };
}

/** A valid contato_vendedor (D-W3: a plain e-mail or an https: URL ≤ 2048), or undefined. */
function contatoFrom(value: unknown): ContatoVendedor | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { tipo, valor } = value as Record<string, unknown>;
  if (typeof valor !== "string") return undefined;
  if (tipo === "email" && PLAIN_EMAIL.test(valor) && valor.length <= 254)
    return { tipo, valor };
  if (tipo === "url" && valor.length <= 2048) {
    try {
      if (new URL(valor).protocol === "https:") return { tipo, valor };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const panelWorkspaceHandlers: RequestHandler[] = [
  http.get("*/v1/me", async ({ request }) => {
    const { token, refused, call } = await incoming(request);
    if (refused) return refused;
    // A poll (X-Kybr-Poll: 1) doesn't keep the session alive (Q decision).
    const account = sessionAccount(
      token,
      request.headers.get("x-kybr-poll") !== "1",
    );
    if (!account) return apiError(401, "SESSAO_EXPIRADA");
    // QA A40-09 / SV-05: the call log names the session's account.
    call.email = account.email;
    // QA G4: a slow or failing /me for one account.
    const fault = takeFault(account.email, "me");
    if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
    if (fault?.kind === "500") return apiError(500, "ERRO_INTERNO");
    if (fault?.kind === "drop") return networkDrop();
    // An unexpected failure, for the panel's fatal-error screen (S16).
    if (scenarioApplies("me-falha", account.email))
      return apiError(500, "ERRO_INTERNO");
    return ok({
      nome: account.nome,
      email: account.email,
      workspace: workspaceView(account),
    });
  }),
  http.get("*/v1/categories", async ({ request }) => {
    const { token, refused, call } = await incoming(request);
    if (refused) return refused;
    const account = sessionAccount(token);
    if (!account) return apiError(401, "SESSAO_EXPIRADA");
    call.email = account.email;
    if (scenarioApplies("categorias-falham", account.email))
      return apiError(500, "ERRO_INTERNO");
    // QA G3: slow enough for the route's skeleton to show.
    if (scenarioApplies("categorias-lentas", account.email)) await delay(1_200);
    return ok([...CATEGORIES]);
  }),
  http.put("*/v1/workspace", async ({ request }) => {
    // QA G2 (M8a): the per-account fault comes first (the partial save).
    const auth = await homeAuthed(request, "workspace-put");
    if ("reply" in auth) return auth.reply;
    const { account } = auth;
    const { body } = auth.incoming;
    // QA G3: the save fails (500), drops, or is refused with a field.
    if (scenarioApplies("workspace-falha", account.email))
      return apiError(500, "ERRO_INTERNO");
    if (scenarioApplies("workspace-queda", account.email)) return networkDrop();
    if (scenarioApplies("workspace-invalido", account.email))
      return apiError(422, "VALOR_INVALIDO", {
        field: "contato_vendedor.valor",
      });
    const workspace = account.workspace;
    if (body.nome !== undefined) {
      const nome = nameFrom(body.nome);
      if (nome === undefined)
        return apiError(422, "VALOR_INVALIDO", { field: "nome" });
      workspace.nome = nome;
    }
    if (body.contato_vendedor !== undefined) {
      const contato = contatoFrom(body.contato_vendedor);
      if (!contato)
        return apiError(422, "VALOR_INVALIDO", {
          field: "contato_vendedor.valor",
        });
      workspace.contato_vendedor = contato;
    }
    if (body.categoria !== undefined) {
      if (!CATEGORIES.some((category) => category.id === body.categoria))
        return apiError(422, "VALOR_INVALIDO", { field: "categoria" });
      workspace.categoria = body.categoria as string;
    }
    if (workspace.contato_vendedor && workspace.categoria)
      workspace.onboarding_concluido = true;
    return ok(workspaceView(account));
  }),
  // D-W4 (C-M8-8): { nome } only → the D-W1 object.
  http.put("*/v1/me", async ({ request }) => {
    const auth = await homeAuthed(request, "me-put");
    if ("reply" in auth) return auth.reply;
    const { body } = auth.incoming;
    const nome = nameFrom(body.nome);
    if (Object.keys(body).length !== 1 || nome === undefined)
      return apiError(422, "VALOR_INVALIDO", { field: "nome" });
    auth.account.nome = nome;
    return ok({
      nome: auth.account.nome,
      email: auth.account.email,
      workspace: workspaceView(auth.account),
    });
  }),
];
