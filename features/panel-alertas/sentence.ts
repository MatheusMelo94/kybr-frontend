import { alertasCopy } from "@/features/panel-alertas/copy";
import { fill } from "@/features/panel-shell/format";
import type { Alert } from "@/lib/api/schemas/panel/alerts";

/**
 * The alert.<TIPO> sentence (spec S8), filled from `dados` and the seller:
 * the razão social, or the masked CNPJ when it's null (G1). The values are
 * data, rendered as React text only (Security A-F2).
 */
export function alertSentence(alert: Alert): string {
  const razao_social = alert.seller.razao_social ?? alert.seller.cnpj;
  switch (alert.tipo) {
    case "SITUACAO_IRREGULAR":
      return fill(alertasCopy["alert.SITUACAO_IRREGULAR"], {
        razao_social,
        ...alert.dados,
      });
    case "IE_SUSPENSA":
      return fill(alertasCopy["alert.IE_SUSPENSA"], {
        razao_social,
        ...alert.dados,
      });
    case "RESPONSAVEL_SAIU_QSA":
      return fill(alertasCopy["alert.RESPONSAVEL_SAIU_QSA"], {
        razao_social,
        ...alert.dados,
      });
    case "QSA_MUDOU":
      return fill(alertasCopy["alert.QSA_MUDOU"], { razao_social });
    case "CNAE_MUDOU":
      return fill(alertasCopy["alert.CNAE_MUDOU"], {
        razao_social,
        ...alert.dados,
      });
    case "REGIME_MUDOU":
      return fill(alertasCopy["alert.REGIME_MUDOU"], {
        razao_social,
        ...alert.dados,
      });
    case "WEBHOOK_FALHOU":
      return fill(alertasCopy["alert.WEBHOOK_FALHOU"], { razao_social });
  }
}
