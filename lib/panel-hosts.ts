// Host classification (ADR-0008 rule 1) and the panel's public paths (ADR-0009
// rule 6). Pure: middleware and the DAL pass in the parsed env.

/** The hosts this deployment answers on. No panelHost: the panel is off. */
export type HostConfig = {
  panelHost?: string;
  linkHosts: readonly string[];
};

export type HostKind = "panel" | "link" | "unknown";

type HostEnv = {
  LINK_HOST?: string | undefined;
  PANEL_HOST?: string | undefined;
  VERCEL_ENV?: string | undefined;
  VERCEL_URL?: string | undefined;
  VERCEL_BRANCH_URL?: string | undefined;
};

/**
 * The hosts from the parsed env. On a Vercel Preview, the deployment's own URLs
 * serve the link too; production's *.vercel.app aliases stay unknown (P03.1).
 */
export function hostConfigFromEnv(env: HostEnv): HostConfig {
  const previewHosts =
    env.VERCEL_ENV === "preview" ? [env.VERCEL_URL, env.VERCEL_BRANCH_URL] : [];
  const linkHosts = [env.LINK_HOST, ...previewHosts].filter(
    (host): host is string => host !== undefined,
  );
  return {
    ...(env.PANEL_HOST !== undefined && { panelHost: env.PANEL_HOST }),
    linkHosts,
  };
}

/** Which surface a Host header belongs to: case-insensitive, port-exact. */
export function classifyHost(
  host: string | null | undefined,
  config: HostConfig,
): HostKind {
  if (!host) return "unknown";
  const normalized = host.toLowerCase();
  if (config.panelHost !== undefined && normalized === config.panelHost)
    return "panel";
  return config.linkHosts.includes(normalized) ? "link" : "unknown";
}

/** The panel paths anyone may open without a session (S1–S3). */
export const PUBLIC_PANEL_PATHS: ReadonlySet<string> = new Set([
  "/entrar",
  "/cadastro",
  "/cadastro/confirmar",
  "/senha/esqueci",
  "/senha/nova",
]);

/** True for every external panel path except the five public ones. */
export function isProtectedPanelPath(path: string): boolean {
  return !PUBLIC_PANEL_PATHS.has(path);
}
