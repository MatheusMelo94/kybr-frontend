import { setupServer } from "msw/node";

import { panelAuthHandlers } from "./handlers/panel-auth.ts";
import { panelWorkspaceHandlers } from "./handlers/panel-workspace.ts";
import { sellerLinkHandlers } from "./handlers/seller-link.ts";

/** MSW server for Vitest: the seller-link (D1–D6) and panel (D-A*, D-W*) handlers, Pre-Contract. */
export const server = setupServer(
  ...sellerLinkHandlers,
  ...panelAuthHandlers,
  ...panelWorkspaceHandlers,
);
