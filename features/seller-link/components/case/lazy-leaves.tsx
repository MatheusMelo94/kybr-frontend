"use client";

import dynamic from "next/dynamic";

// The case page's follow-up leaves, split out of the route's First Load JS
// (ADR-0003 budget watch; tasks.md "the first lever"). They render only on
// *quase lá* and *em análise*, below the result heading, so their chunks load
// after the page shell. A Server Component can't code-split a client import,
// hence this small client module. Server-rendered as usual (ssr stays on), so
// there's no layout shift while a chunk loads.

/** ContactEmailBlock (T29), loaded on demand. */
export const LazyContactEmailBlock = dynamic(() =>
  import("@/features/seller-link/components/case/contact-email-block").then(
    (module) => module.ContactEmailBlock,
  ),
);
