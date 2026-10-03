import { createServer as createHttpServer } from "node:http";

import { createServer } from "@mswjs/http-middleware";

import {
  mockControlHandlers,
  sellerLinkHandlers,
} from "./handlers/seller-link.ts";

// The seller-link MSW handlers over HTTP (Pre-Contract D1–D6), for `pnpm dev`
// and Playwright: Server Components and Actions reach it through API_BASE_URL,
// and the browser uploads to it through API_PUBLIC_BASE_URL (D6, with CORS).
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).

const port = Number(process.env.MOCK_API_PORT ?? "4010");
// Loopback only: the /__mock/* controls create cases and inject failures, so
// nothing else on the network should reach them (security finding M2-06). A
// CI setup that needs the mock from another container sets MOCK_API_HOST.
const host = process.env.MOCK_API_HOST ?? "127.0.0.1";

const app = createServer(...mockControlHandlers, ...sellerLinkHandlers);

createHttpServer((request, response) => {
  // HttpResponse.error() (the S13 network-drop marker) arrives as status 0,
  // which Node can't send. Drop the socket instead, so the browser sees a real
  // network failure.
  const end = response.end.bind(response);
  response.end = ((...args: Parameters<typeof end>) => {
    if (response.statusCode === 0) {
      request.socket.destroy();
      return response;
    }
    return end(...args);
  }) as typeof response.end;
  app(request, response);
}).listen(port, host, () => {
  console.log(`Kybr mock API (Pre-Contract D1–D6) on http://${host}:${port}`);
});
