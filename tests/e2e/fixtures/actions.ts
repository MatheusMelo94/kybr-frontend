import { readFileSync } from "node:fs";

// The Server Action ids of the build under test (the webServer's `pnpm
// build`), for replays that need an id the page doesn't own.
type Manifest = {
  node: Record<string, { exportedName?: string }>;
};

export function actionId(exportedName: string): string {
  const manifest = JSON.parse(
    readFileSync(".next/server/server-reference-manifest.json", "utf8"),
  ) as Manifest;
  const entry = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === exportedName,
  );
  if (entry === undefined) throw new Error(`no action ${exportedName}`);
  return entry[0];
}
