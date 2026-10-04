// Server Action ids from a Next build (review 0019). A Server Action POST
// carries its action id in the `next-action` header; the build's
// .next/server/server-reference-manifest.json maps each id to its file and
// export name. Matching on the id keeps a spec right when an action's
// arguments change (T26b adds one), where matching on their shape would
// silently count nothing.

type ActionEntry = { filename?: string; exportedName?: string };
type Manifest = {
  node?: Record<string, ActionEntry>;
  edge?: Record<string, ActionEntry>;
};

/** The id of `exportName` from `file` in the build; throws when it isn't there. */
export function serverActionId(
  manifest: Manifest,
  file: string,
  exportName: string,
): string {
  const entries = Object.entries({ ...manifest.edge, ...manifest.node });
  const hit = entries.find(
    ([, entry]) => entry.filename === file && entry.exportedName === exportName,
  );
  if (hit === undefined)
    throw new Error(
      `No Server Action ${exportName} from ${file} in this build. Run pnpm build first.`,
    );
  return hit[0];
}
