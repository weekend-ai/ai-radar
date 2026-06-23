"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";

/**
 * Client-side button: POSTs to /api/drafts then either navigates to the new
 * draft's editor or surfaces the error. windowDays is editable via prompt()
 * so we don't need a whole modal for the MVP.
 */
export function GenerateDraftButton({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const days = window.prompt(t("drafts.windowPrompt", lang), "7");
    if (days === null) return;
    const windowDays = Number.parseInt(days, 10);
    if (!Number.isFinite(windowDays) || windowDays <= 0) {
      setError(t("drafts.windowInvalid", lang));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ windowDays }),
      });
      const data = (await resp.json()) as { issueId?: string; error?: string };
      if (!resp.ok) {
        setError(data.error ?? `HTTP ${resp.status}`);
        return;
      }
      if (data.issueId) {
        // typedRoutes: dynamic href needs `as never` (captured pitfall).
        router.push(`/drafts/${data.issueId}` as never);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
      >
        {busy ? t("drafts.generating", lang) : t("drafts.generate", lang)}
      </button>
      {error ? (
        <span className="max-w-xs text-right text-xs text-red-400">{error}</span>
      ) : null}
    </div>
  );
}
