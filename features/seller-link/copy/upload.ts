// Spec v2 § Content & Copy, verbatim. Document upload, per requested document
// (inside *quase lá*). Fill placeholders with fill() from features/seller-
// link/format.ts. Never edit a string here without the spec changing first (the
// UX Strategist owns the copy).
export const uploadCopy = {
  "upload.cta": "Enviar documento",
  "upload.hint": "PDF ou fotos, até 10 MB no total.",
  "upload.busy": "Enviando…",
  "upload.received.one": "Recebido: 1 arquivo",
  "upload.received.many": "Recebido: {n} arquivos",
  "upload.add": "Adicionar página",
  "upload.error.size": "Passou de 10 MB. Envie um PDF menor ou menos fotos.",
  "upload.error.type": "Formato não aceito. Envie PDF, JPG ou PNG.",
  "upload.error.mixed":
    "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
  "upload.error.network": "Não conseguimos enviar o documento. Tente de novo.",
  "upload.error.closed":
    "Este cadastro já foi decidido. Não é mais preciso enviar documentos.",
} as const;
