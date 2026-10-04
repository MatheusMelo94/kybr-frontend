import { notFound } from "next/navigation";

// /v/{slug}/c with no token (a saved link with the token cut off): Case not
// found, 404, with "Começar de novo" (QA-M2-003, decision Q8), from the
// sibling c/not-found.tsx. No API call: like a malformed token, it reveals
// nothing about the link or any case.
export default function CaseIndexPage(): never {
  notFound();
}
