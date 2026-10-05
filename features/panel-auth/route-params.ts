import type { AuthBannerKind } from "@/features/panel-auth/components/auth-banner";
import { safeReturnPath } from "@/lib/safe-return-path";

type RawParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** /entrar's query: a validated `volta` (P10) and the banner `motivo` asks for. */
export function entrarParams(raw: RawParams): {
  volta: string | null;
  banner: AuthBannerKind | null;
} {
  const motivo = single(raw.motivo);
  const banner: AuthBannerKind | null =
    motivo === "sessao"
      ? single(raw.perdido) === "1"
        ? "sessao-perdido"
        : "sessao"
      : motivo === "saiu" || motivo === "senha-nova"
        ? motivo
        : null;
  return { volta: safeReturnPath(single(raw.volta)), banner };
}
