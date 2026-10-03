// CPF data minimization, shared by every surface (spec v3 § Company data on the
// link; contract X7; threat model F12). An MEI's business name embeds the
// owner's CPF. The backend masks it; this is the frontend backstop.

export const CPF_MASK = "***.***.***-**";

// An 11-digit run in the 3-3-3-2 shape, bare or with one of . - / or a space
// at each separator, with no digit before it (security findings 0002, M2-01).
// A non-digit (or the start) is captured in front instead of a word boundary,
// so a CPF glued to letters or _ is caught. It must end the digit run, or be
// followed by more whole 11-digit runs (back-to-back CPFs), so longer runs (a
// CNPJ's 14) stay untouched. No lookbehind: this ships to the browser, and
// Safari < 16.4 can't parse it.
const CPF_RUN =
  /(^|\D)\d{3}[-.\s/]?\d{3}[-.\s/]?\d{3}[-.\s/]?\d{2}(?=\D|$|(?:\d{11})+(?!\d))/g;

/** Fullwidth ASCII (U+FF01–FF5E, e.g. "１２３．") read as ASCII, so it can't dodge the match. */
function foldFullwidth(text: string): string {
  return text.replace(/[！-～]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );
}

/** Replaces every CPF-shaped run in `text` with CPF_MASK. */
export function maskCpf(text: string): string {
  let masked = foldFullwidth(text);
  // Back-to-back CPFs: each pass masks the first, and the mask's "*" is the
  // non-digit the next one needs in front.
  for (let previous = ""; previous !== masked;) {
    previous = masked;
    masked = masked.replace(
      CPF_RUN,
      (_run, before: string) => `${before}${CPF_MASK}`,
    );
  }
  return masked;
}
