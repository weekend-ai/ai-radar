"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";

type Member = { articleId: string; title: string };

/**
 * Modal: pick 1+ articles to spin out into a new topic. Refuses if you
 * select all of them (would empty the source — the API enforces this too).
 */
export function SplitDialog({
  sourceTopicId,
  members,
  lang,
  onClose,
  onSplit,
}: {
  sourceTopicId: string;
  members: Member[];
  lang: Lang;
  onClose: () => void;
  onSplit: (newTopicId: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function submit() {
    if (picked.size === 0) {
      setError(lang === "zh" ? "至少选 1 篇文章" : "pick at least one article");
      return;
    }
    if (picked.size >= members.length) {
      setError(
        lang === "zh"
          ? "不能把所有文章都拆走（会留空原话题）"
          : "can't split out every article — source would be empty"
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${sourceTopicId}/split`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          articleIds: Array.from(picked),
          newTitleEn: newTitle.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `split failed (${res.status})`);
        setBusy(false);
        return;
      }
      onSplit(body.newTopicId);
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
            {lang === "zh" ? "拆分话题（选要移走的文章）" : "Split — move articles to a new topic"}
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg">
            ✕
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={
              lang === "zh"
                ? "新话题标题（可留空，自动用 ‘原标题 (split)’）"
                : "new topic title (optional)"
            }
            className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
          />
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {members.map((m) => (
            <li key={m.articleId} className="border-b border-border/50 last:border-0">
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-bg/50">
                <input
                  type="checkbox"
                  checked={picked.has(m.articleId)}
                  onChange={() => toggle(m.articleId)}
                  className="mt-1"
                />
                <p className="min-w-0 flex-1 truncate text-sm">{m.title}</p>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs text-muted">
            {picked.size} / {members.length}{" "}
            {lang === "zh" ? "篇已选" : "selected"}
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
              {busy ? (lang === "zh" ? "拆分中…" : "Splitting…") : lang === "zh" ? "确认拆分" : "Confirm split"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
