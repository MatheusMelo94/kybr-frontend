import { setupServer } from "msw/node";

import { sellerLinkHandlers } from "./handlers/seller-link.ts";

/** MSW server for Vitest: the seller-link handlers (Pre-Contract D1–D6). */
export const server = setupServer(...sellerLinkHandlers);
