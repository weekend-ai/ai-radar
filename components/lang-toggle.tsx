"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/i18n";

/**
 * Global EN/中文 toggle. Lives in the topbar.
 *
 * Writes both the cookie (sticky) and a `?lang=` param on the current URL
 * (immediate render). The cookie is `max-age=1 year`, SameSite=Lax,
 * path=/ so every server component sees it.
 */
export function LangToggle({ current }: { current: Lang }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setLang(next: Lang) {
    if (next === current) return;
    // 1y cookie. Lax so external links → us still keep it; we're not cross-site.
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "en") params.delete("lang");
    else params.set("lang", next);
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      // Dynamic href on typedRoutes needs `as never` (captured pitfall).
      router.push(href as never);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="language"
      className={`flex items-center overflow-hidden rounded border border-border text-xs ${pending ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className={
          current === "en"
            ? "bg-accent px-2 py-0.5 text-bg"
            : "px-2 py-0.5 text-muted hover:text-fg"
        }
        aria-pressed={current === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("zh")}
        className={
          current === "zh"
            ? "bg-accent px-2 py-0.5 text-bg"
            : "px-2 py-0.5 text-muted hover:text-fg"
        }
        aria-pressed={current === "zh"}
      >
        中文
      </button>
    </div>
  );
}
