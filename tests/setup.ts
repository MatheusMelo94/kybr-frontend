import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// `server-only` is a build-time guard (it throws outside the react-server
// condition). Next enforces it in `pnpm build`; under Vitest it's a no-op.
vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
});
