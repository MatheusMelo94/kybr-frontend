"use client";

import {
  Suspense,
  lazy,
  useEffect,
  type ComponentProps,
  type JSX,
} from "react";

// The case page's follow-up leaves, split out of the route's First Load JS
// (ADR-0003 budget watch; tasks.md "the first lever"). They render only on
// *quase lá* and *em análise*, below the result heading, so their chunks load
// after the page shell. A Server Component can't code-split a client import,
// hence this small client module. Server-rendered as usual, so there's no
// layout shift while a chunk loads: until it has, hydration keeps the server
// HTML inside the Suspense boundary.
//
// React.lazy, not next/dynamic (QA-M3-001): next/dynamic's PreloadChunks
// emits <link rel="preload" as="script"> without the CSP nonce, so the strict
// policy refuses it and Chromium logs a console error. Pre-Convention: the
// conventions name next/dynamic for code splitting; Architect to confirm.

const ContactEmailBlock = lazy(() =>
  import("@/features/seller-link/components/case/contact-email-block").then(
    (module) => ({ default: module.ContactEmailBlock }),
  ),
);

const DocumentUpload = lazy(() =>
  import("@/features/seller-link/components/case/document-upload").then(
    (module) => ({ default: module.DocumentUpload }),
  ),
);

/** ContactEmailBlock (T29), loaded on demand. */
export function LazyContactEmailBlock(
  props: ComponentProps<typeof ContactEmailBlock>,
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <ContactEmailBlock {...props} />
    </Suspense>
  );
}

/** DocumentUpload (T30), loaded on demand. */
export function LazyDocumentUpload(
  props: ComponentProps<typeof DocumentUpload>,
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <DocumentUpload {...props} />
    </Suspense>
  );
}

/**
 * Rendered on *verificando*: fetches the e-mail block's chunk while the page
 * is still online. The 10 s switch shows *em análise* (with the block) on the
 * client even when the connection is gone (spec AC 29), and a chunk that
 * can't load would keep that view from rendering. Renders nothing.
 */
export function PreloadAnalysisLeaves(): null {
  useEffect(() => {
    // Same module as LazyContactEmailBlock's import, so the same chunk.
    void import("@/features/seller-link/components/case/contact-email-block");
  }, []);
  return null;
}
