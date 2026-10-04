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

/** D6's limit: 10 MB in total per document, across every call (spec § Upload). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadIssue = "size" | "type" | "mixed";

const PDF = "application/pdf";
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const EXTENSIONS: Record<string, string> = {
  pdf: PDF,
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** The file's type, or one read from its extension when the picker gave none. */
export function uploadType(file: File): string {
  if (file.type !== "") return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[extension] ?? "";
}

/**
 * The client's pre-checks for one pick (spec AC 22), for UX only: the API is
 * authoritative (magic bytes, size, case state). A document takes one PDF or
 * only photos, so any PDF next to other files, or added to files already
 * received, is mixing. `sentBytes` is what this page already sent for the
 * document. Plain code, not zod: see the note at the top.
 */
export function checkUpload(
  files: readonly File[],
  { received, sentBytes }: { received: number; sentBytes: number },
): UploadIssue | null {
  const types = files.map(uploadType);
  if (types.some((type) => type !== PDF && !PHOTO_TYPES.has(type)))
    return "type";
  const pdfs = types.filter((type) => type === PDF).length;
  if (pdfs > 0 && (files.length > 1 || received > 0)) return "mixed";
  const bytes = files.reduce((total, file) => total + file.size, sentBytes);
  if (bytes > MAX_UPLOAD_BYTES) return "size";
  return null;
}
