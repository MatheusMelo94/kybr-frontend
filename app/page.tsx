import { notFound } from "next/navigation";

// The root has no screen: the seller link lives at /v/{slug}, and host routing
// for the panel arrives with ADR-0002's panel plan. "/" answers Link not found
// (404), rendered by the app router so it gets the per-request CSP nonce.
export default function RootPage(): never {
  notFound();
}
