import { notFound } from "next/navigation";

// /v/{slug}/c with no token (a saved link with the token cut off): Case not
// found, 404, with "Começar de novo" (QA-M2-003, decision Q8), from the
// sibling not-found.tsx. The group's layout has already answered Link not
// found for a dead link (QA-M3-002). No case read: it reveals nothing about
// any case.
export default function CaseIndexPage(): never {
  notFound();
}
