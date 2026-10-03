import type { CaseView } from "@/features/seller-link/types";
import type { PublicCase } from "@/lib/api/schemas/public-link";

// The case page's view, derived from D4 (plan § 4; tech-design § 3 rules 3–4).
// Pure: the page and the status-check action both call it, with the server's
// clock, so the phone's clock never decides when *em análise* shows.

/** Still processing this long after criado_em → *em análise* (spec AC 17). */
export const ANALYSIS_TIMEOUT_MS = 10_000;

/** The view for `publicCase` at `now` (ms since the epoch). */
export function deriveCaseView(
  { estado, criado_em, resultado }: PublicCase,
  now: number,
): CaseView {
  // DADOS_NAO_ENCONTRADOS wins over the timing. A no-data case shows *quase
  // lá* only once Renata has requested something (spec v3).
  const noData = resultado?.variante === "DADOS_NAO_ENCONTRADOS";
  const hasItems = (resultado?.itens?.length ?? 0) > 0;
  if (
    noData &&
    (estado === "processing" || (estado === "pending" && !hasItems))
  )
    return { viewKey: "analysis-notfound", step: 2, msUntilTimeout: 0 };

  if (estado === "processing") {
    // A criado_em ahead of the server clock never stretches the wait past 10 s.
    const elapsed = Math.max(0, now - Date.parse(criado_em));
    const msUntilTimeout = Math.max(0, ANALYSIS_TIMEOUT_MS - elapsed);
    return msUntilTimeout > 0
      ? { viewKey: "verifying", step: 2, msUntilTimeout }
      : { viewKey: "analysis-timeout", step: 2, msUntilTimeout: 0 };
  }

  return { viewKey: estado, step: 3, msUntilTimeout: 0 };
}
