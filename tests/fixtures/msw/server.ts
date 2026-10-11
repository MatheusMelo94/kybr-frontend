import { setupServer } from "msw/node";

import { panelAuthHandlers } from "./handlers/panel-auth.ts";
import { panelAlertHandlers } from "./handlers/panel-alerts.ts";
import { panelBatchHandlers } from "./handlers/panel-batches.ts";
import {
  panelCaseHandlers,
  panelDocumentHandlers,
} from "./handlers/panel-cases.ts";
import { panelHomeHandlers } from "./handlers/panel-home.ts";
import { panelSellerHandlers } from "./handlers/panel-sellers.ts";
import { panelWorkspaceHandlers } from "./handlers/panel-workspace.ts";
import { sellerLinkHandlers } from "./handlers/seller-link.ts";

/** MSW server for Vitest: the seller-link (D1–D6) and panel (D-A*, D-W*, D-B*, D-C*, D-M*, D-H*, D-S*, D-R1) handlers, Pre-Contract. */
export const server = setupServer(
  ...sellerLinkHandlers,
  ...panelAuthHandlers,
  ...panelWorkspaceHandlers,
  ...panelBatchHandlers,
  ...panelCaseHandlers,
  ...panelAlertHandlers,
  ...panelHomeHandlers,
  ...panelSellerHandlers,
  ...panelDocumentHandlers,
);
