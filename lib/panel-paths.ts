// The panel's internal segment (ADR-0008 rule 2). Middleware rewrites every
// panel-host path p to /painel{p}; links, redirect() and router.push() use the
// external path, and only revalidatePath() and file paths use the internal
// one. This is the only place the prefix is written (a test enforces it).

const PANEL_PREFIX = "/painel";

/** "/fila" → "/painel/fila"; "/" → "/painel". */
export function panelPath(externalPath: string): string {
  if (!externalPath.startsWith("/") || externalPath.startsWith("//"))
    throw new Error("panelPath takes an absolute external path");
  return externalPath === "/" ? PANEL_PREFIX : `${PANEL_PREFIX}${externalPath}`;
}
