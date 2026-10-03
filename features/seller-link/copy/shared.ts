// Spec v2 § Content & Copy, verbatim. Strings used on more than one screen: the
// step indicator, the privacy footer and the external-link suffix. Fill
// placeholders with fill() from features/seller-link/format.ts. Never edit a
// string here without the spec changing first (the UX Strategist owns the
// copy).
export const sharedCopy = {
  "step.sr": "Passo {n} de 3",
  "privacy.line": "Usamos estes dados só para verificar sua empresa.",
  "privacy.link": "Como tratamos seus dados",
  "external.sr": "(abre em outra aba)",
} as const;
