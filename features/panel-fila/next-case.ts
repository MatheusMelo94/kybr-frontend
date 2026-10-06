/**
 * The case to open after one is decided (plan-m6 D5): the next visible one
 * below, otherwise the one above, otherwise none (the empty state). A
 * decided id that isn't visible has no neighbour: none.
 */
export function nextCaseId(
  visibleIds: readonly string[],
  decidedId: string,
): string | null {
  const index = visibleIds.indexOf(decidedId);
  if (index === -1) return null;
  return visibleIds[index + 1] ?? visibleIds[index - 1] ?? null;
}
