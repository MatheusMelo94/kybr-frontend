// CPF data minimization, shared by every surface (spec v3 § Company data on the
// link; contract X7; threat model F12). An MEI's business name embeds the
// owner's CPF. The backend masks it; this is the frontend backstop.

export const CPF_MASK = "***.***.***-**";

// A word-bounded 11-digit run, with or without the usual . and - punctuation.
// Word boundaries keep longer digit runs (a CNPJ's 14 digits) untouched.
const CPF_RUN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/** Replaces every CPF-shaped run in `text` with CPF_MASK. */
export function maskCpf(text: string): string {
  return text.replace(CPF_RUN, CPF_MASK);
}
