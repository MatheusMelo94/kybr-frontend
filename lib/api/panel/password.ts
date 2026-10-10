import "server-only";

import type { ApiResult } from "@/lib/api/client";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  sessionGrantSchema,
  type SessionGrant,
} from "@/lib/api/schemas/panel/account";

/**
 * D-A6 (C-M8-7): changes the password. A 200 is the rotated session, parsed
 * with the login's sessionGrantSchema (O-F3); a wrong current password is a
 * 403 SENHA_ATUAL_INCORRETA, never a 401 (O-F1). Sent once: no retry on an
 * unknown outcome (O-F2). The body is never logged.
 */
export async function changePassword(input: {
  senha_atual: string;
  senha_nova: string;
}): Promise<ApiResult<SessionGrant>> {
  const token = await sessionToken();
  return panelRequest({
    operation: "password-change",
    path: apiPaths.panel.password(),
    method: "POST",
    body: input,
    schema: sessionGrantSchema,
    ...(token !== undefined && { sessionToken: token }),
  });
}
