import { createHash } from "node:crypto";

/**
 * Normalize a URL for dedup:
 * - lowercase scheme + host
 * - strip default port
 * - strip trailing slash
 * - strip utm_* / fbclid / gclid params
 * - strip fragment
 */
export function canonicalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";

    // strip tracking params
    const toDelete: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (
        k.startsWith("utm_") ||
        k === "fbclid" ||
        k === "gclid" ||
        k === "mc_cid" ||
        k === "mc_eid" ||
        k === "ref" ||
        k === "ref_src"
      ) {
        toDelete.push(k);
      }
    });
    for (const k of toDelete) u.searchParams.delete(k);

    let s = u.toString();
    // strip trailing slash on path-only (keep root)
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return input.trim();
  }
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Normalize a title for hash-based dedup. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'") // smart quotes
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

export function titleHash(title: string): string {
  return sha1(normalizeTitle(title));
}

export function urlHash(url: string): string {
  return sha1(canonicalizeUrl(url));
}

export function contentHash(content: string | null | undefined): string | null {
  if (!content) return null;
  return sha1(content.trim().slice(0, 4000));
}
