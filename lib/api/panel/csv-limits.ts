/**
 * O-F5 (T149): the one size cap for every CSV the panel buffers and passes on
 * (M5's batch downloads, M8's exports). Under Vercel's 4.5 MB function
 * response limit, so an oversized file is a 502 → export.error, never a
 * platform error (M6C-03; ADR-0011 rule 4).
 */
export const CSV_MAX_BYTES = 4 * 1024 * 1024;
