import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { resetSellerLinkMock } from "./fixtures/msw/handlers/seller-link.ts";
import { resetPanelMock } from "./fixtures/msw/panel-store.ts";
import { server } from "./fixtures/msw/server.ts";

// `server-only` is a build-time guard (it throws outside the react-server
// condition). Next enforces it in `pnpm build`; under Vitest it's a no-op.
vi.mock("server-only", () => ({}));

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetSellerLinkMock();
  resetPanelMock();
});

afterAll(() => {
  server.close();
});
