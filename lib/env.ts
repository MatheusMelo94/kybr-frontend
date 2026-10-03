import "server-only";

import { parseServerEnv } from "./env-schema";

export type { ServerEnv } from "./env-schema";

/** The validated server environment. The only place app code reads process.env. */
export const env = parseServerEnv(process.env);
