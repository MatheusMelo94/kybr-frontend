// CPF data minimization, shared by every surface (spec v3 § Company data on the
// link; contract X7; threat model F12). An MEI's business name embeds the
// owner's CPF. The backend masks it; this is the frontend backstop.

export const CPF_MASK = "***.***.***-**";

// An 11-digit run in the 3-3-3-2 shape, bare or separated by ., - or spaces,
// with no digit on either side (security finding 0002). A non-digit (or the
// start) is captured in front instead of a word boundary, so a CPF glued to
// letters or _ is caught, and longer digit runs (a CNPJ's 14) stay untouched.
// No lookbehind: this ships to the browser, and Safari < 16.4 can't parse it.
const CPF_RUN = /(^|\D)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/g;

/** Replaces every CPF-shaped run in `text` with CPF_MASK. */
export function maskCpf(text: string): string {
  return text.replace(
    CPF_RUN,
    (_run, before: string) => `${before}${CPF_MASK}`,
  );
}
