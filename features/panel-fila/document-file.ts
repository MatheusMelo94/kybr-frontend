import type { DocumentoTipo } from "@/lib/panel-api-values";

/** The only document files the panel hands over (D-C6, F4). */
export const DOCUMENT_FILE_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
} as const;

export type DocumentExtension = keyof typeof DOCUMENT_FILE_TYPES;

/**
 * F4: `documento-<tipo>.<ext>`, built from the case's type and the sniffed
 * extension, never from the upstream's name. Shared by the handler's header
 * and the download link, which names the blob the same way.
 */
export function documentFilename(
  tipo: DocumentoTipo,
  ext: DocumentExtension,
): string {
  return `documento-${tipo.toLowerCase().replaceAll("_", "-")}.${ext}`;
}

/** The extension for a type the handler set, or undefined for anything else. */
export function extensionForType(type: string): DocumentExtension | undefined {
  return (Object.keys(DOCUMENT_FILE_TYPES) as DocumentExtension[]).find(
    (ext) => DOCUMENT_FILE_TYPES[ext] === type,
  );
}
