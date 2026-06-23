/**
 * Bilingual UI scaffolding (client-safe portion).
 *
 * IMPORTANT: this file must remain free of server-only imports
 * (`next/headers`, `next/cache`, etc.) so client components (`lang-toggle`)
 * can import the Lang type, the cookie name, the `STRINGS` dict, and `t()`.
 *
 * Server-only helpers (`resolveLang` reading cookies) live in
 * `./i18n.server.ts` and must only be imported from server components /
 * route handlers.
 */

export type Lang = "en" | "zh";

export const LANG_COOKIE = "ai-radar-lang";
export const SUPPORTED_LANGS: Lang[] = ["en", "zh"];

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "zh";
}

/**
 * Pick the right bilingual column from a row, falling back to English then
 * to the raw text. Use this everywhere a row has `*En` / `*Zh` siblings so
 * we never render an empty string when only one language is populated.
 */
export function pickBilingual<T extends Record<string, unknown>>(
  row: T,
  lang: Lang,
  base: string
): string | null {
  const zh = row[`${base}Zh`] as string | null | undefined;
  const en = row[`${base}En`] as string | null | undefined;
  const raw = row[base] as string | null | undefined;
  if (lang === "zh" && zh) return zh;
  if (en) return en;
  return zh ?? raw ?? null;
}

// ------------------------------------------------------------------------
// UI chrome strings — flat dict, no nested namespaces (keep it boring).
// Add new ids here as pages need them.
// ------------------------------------------------------------------------
export const STRINGS = {
  // Nav
  "nav.dashboard": { en: "Dashboard", zh: "总览" },
  "nav.inbox": { en: "Inbox", zh: "收件箱" },
  "nav.topics": { en: "Topics", zh: "话题" },
  "nav.drafts": { en: "Drafts", zh: "草稿" },
  "nav.sources": { en: "Sources", zh: "源" },
  "nav.jobs": { en: "Jobs", zh: "任务" },
  // Common
  "common.lang": { en: "lang", zh: "语言" },
  "common.sort": { en: "sort", zh: "排序" },
  "common.score": { en: "score", zh: "分数" },
  "common.size": { en: "size", zh: "规模" },
  "common.recent": { en: "recent", zh: "最新" },
  "common.untitled": { en: "(untitled)", zh: "（无标题）" },
  "common.created": { en: "created", zh: "创建于" },
  // Drafts list
  "drafts.title": { en: "Newsletter Drafts", zh: "通讯草稿" },
  "drafts.subtitle": {
    en: "Bilingual weekly drafts generated from the top scored topics.",
    zh: "基于高分话题自动生成的双语周报草稿。",
  },
  "drafts.generate": { en: "Generate draft", zh: "生成草稿" },
  "drafts.generating": { en: "Generating…", zh: "生成中…" },
  "drafts.empty": {
    en: 'No drafts yet. Click "Generate draft" to produce one from the last 7 days of topics.',
    zh: "还没有草稿。点击「生成草稿」从最近 7 天的话题中产出一份。",
  },
  "drafts.windowPrompt": { en: "Window (days):", zh: "时间窗口（天）：" },
  "drafts.windowInvalid": {
    en: "Window must be a positive integer.",
    zh: "时间窗口必须是正整数。",
  },
  // Topics page
  "topics.title": { en: "Topic Radar", zh: "话题雷达" },
  // Inbox page
  "inbox.title": { en: "Inbox", zh: "收件箱" },
} as const;

export type StringId = keyof typeof STRINGS;

export function t(id: StringId, lang: Lang): string {
  return STRINGS[id][lang];
}
