"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";

type Candidate = { id: string; titleEn: string | null; articleCount: number; finalScore: number | null };

/**
 * Modal: pick 1+ other topics to fold into the current (survivor) topic.
 * POSTs to /api/topics/merge then calls onMerged.
 */
export function MergeDialog({
  survivorId,
  candidates,
  lang,
  onClose,
  onMerged,
}: {
  survivorId: string;
  candidates: Candidate[];
  lang: Lang;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = candidates.filter((c) =>
    !filter ? true : (c.titleEn ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function submit() {
    if (picked.size === 0) {
      setError(lang === "zh" ? "至少选 1 个话题" : "pick at least one topic");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/topics/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ survivorId, mergedIds: Array.from(picked) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `merge failed (${res.status})`);
        setBusy(false);
        return;
      }
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">
            {lang === "zh" ? "合并话题（选要合并进来的）" : "Merge topics into this one"}
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg">
            ✕
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={lang === "zh" ? "搜索标题…" : "filter by title…"}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
          />
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted">
              {lang === "zh" ? "没有可合并的话题" : "no candidates"}
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id} className="border-b border-border/50 last:border-0">
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-bg/50">
                  <input
                    type="checkbox"
                    checked={picked.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{c.titleEn ?? "(untitled)"}</p>
                    <p className="text-xs text-muted">
                      {c.articleCount} {lang === "zh" ? "篇" : "articles"}
                      {c.finalScore !== null ? ` · score ${c.finalScore}` : ""}
                    </p>
                  </div>
                </label>
              </li>
            ))
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs text-muted">
            {picked.size} {lang === "zh" ? "个已选" : "selected"}
            {error ? <span className="ml-3 text-red-400">{error}</span> : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded border border-border px-3 py-1 text-sm text-muted hover:text-fg"
            >
              {lang === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || picked.size === 0}
              className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-50"
            >
              {busy ? (lang === "zh" ? "合并中…" : "Merging…") : lang === "zh" ? "确认合并" : "Confirm merge"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
