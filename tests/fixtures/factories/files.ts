import { UPLOAD_MARKERS } from "./seller-link.ts";

// Upload test files with real magic bytes and exact sizes (QA M3 test plan
// G9), in the shape Playwright's setInputFiles takes. The mock's D6 handler
// sniffs the first bytes, so a type is what the bytes say, not the name.

export type TestFile = { name: string; mimeType: string; buffer: Buffer };

function build(
  magic: number[],
  bytes: number,
  name: string,
  mimeType: string,
): TestFile {
  const buffer = Buffer.alloc(Math.max(bytes, magic.length), 0x20);
  buffer.set(magic, 0);
  return { name, mimeType, buffer: buffer.subarray(0, bytes) };
}

/** A PDF of exactly `bytes` bytes (starts with %PDF-). */
export function pdf(bytes = 2_048, name = "documento.pdf"): TestFile {
  return build([0x25, 0x50, 0x44, 0x46, 0x2d], bytes, name, "application/pdf");
}

/** A JPEG of exactly `bytes` bytes (FF D8 FF). */
export function jpeg(bytes = 2_048, name = "pagina.jpg"): TestFile {
  return build([0xff, 0xd8, 0xff, 0xe0], bytes, name, "image/jpeg");
}

/** A PNG of exactly `bytes` bytes (89 50 4E 47). */
export function png(bytes = 2_048, name = "pagina.png"): TestFile {
  return build(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    bytes,
    name,
    "image/png",
  );
}

/** Not accepted: a GIF. */
export function gif(name = "imagem.gif"): TestFile {
  return build([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 512, name, "image/gif");
}

/** Not accepted: a WebP (RIFF....WEBP). */
export function webp(name = "imagem.webp"): TestFile {
  return build(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    512,
    name,
    "image/webp",
  );
}

/** Not accepted: a HEIC photo (an iPhone's default; ....ftypheic). */
export function heic(name = "foto.heic"): TestFile {
  return build(
    [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
    512,
    name,
    "image/heic",
  );
}

/** Plain text under any name and MIME type, e.g. a fake foto.jpg (UE11). */
export function textAs(name: string, mimeType: string, bytes = 512): TestFile {
  return build([0x74, 0x65, 0x78, 0x74], bytes, name, mimeType);
}

/** An empty file with no type. */
export function zeroByte(name = "vazio"): TestFile {
  return { name, mimeType: "", buffer: Buffer.alloc(0) };
}

/** The same file with an UPLOAD_MARKERS key in its name, to force a D6 outcome (S13). */
export function marked(
  file: TestFile,
  marker: keyof typeof UPLOAD_MARKERS,
): TestFile {
  return { ...file, name: `${UPLOAD_MARKERS[marker]}${file.name}` };
}
