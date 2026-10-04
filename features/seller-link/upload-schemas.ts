import * as z from "zod/mini";

// Upload schemas for DocumentUpload (ADR-0004b). Their own module, never
// schemas.ts: that one is on the form route, and every byte here would land
// there too (ADR-0003 budget watch). zod/mini, since a client leaf imports it.
// webpack shares zod/mini's modules between the form and this leaf's lazy
// chunk, so only the pieces the form already uses appear here: a new zod
// module would ride on the form route's First Load JS.

/** A whole number of files, 0 or more. */
const fileCount = z.pipe(
  z.unknown(),
  z.transform((value, ctx) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0)
      return value;
    ctx.issues.push({ code: "custom", message: "count", input: value });
    return 0;
  }),
);

/** D6 201: how many files the document has now, across every call. */
export const uploadResponseSchema = z.object({
  tipo: z.string(),
  documentos_enviados: fileCount,
});
