/**
 * Server-only helpers for language resolution.
 *
 * Lives in a separate module from `./i18n.ts` because `next/headers` makes
 * the whole import chain unusable from client components. Server components
 * and route handlers import these helpers; client components import only
 * the type, cookie name, dict, and `t()` from `./i18n.ts`.
 */

import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, type Lang } from "./i18n";

/**
 * Resolve from explicit URL searchParams first, fall back to cookie, fall
 * back to "en". Pass in the already-awaited searchParams object so each
 * page can do `const lang = await resolveLang(await searchParams)`.
 *
 * Call with no arguments (or `resolveLang()`) when the page has no searchParams
 * — it'll skip the URL check and go straight to cookie + default.
 */
export async function resolveLang(params?: {
  lang?: string | string[] | undefined;
}): Promise<Lang> {
  const fromUrl = params?.lang;
  const candidate = Array.isArray(fromUrl) ? fromUrl[0] : fromUrl;
  if (isLang(candidate)) return candidate;
  return resolveLangFromCookie();
}

export async function resolveLangFromCookie(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
}
