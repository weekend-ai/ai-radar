"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";

/**
 * Free-form notes scratchpad. Persists on blur or explicit Save click.
 * Empty string clears the column to NULL on the server.
 */
export function NotesEditor({
  topicId,
  initialNotes,
  lang,
}: {
  topicId: string;
  initialNotes: string | null;
  lang: Lang;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialNotes ?? "");
  const [savedValue, setSavedValue] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== savedValue;

  async function save() {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/topics/${topicId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `save failed (${res.status})`);
      setBusy(false);
      return;
    }
    setSavedValue(value);
    setBusy(false);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {lang === "zh" ? "笔记" : "Notes"}
        </h2>
        {dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-bg disabled:opacity-50"
          >
            {busy ? (lang === "zh" ? "保存中…" : "Saving…") : lang === "zh" ? "保存" : "Save"}
          </button>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder={
          lang === "zh"
            ? "写点你对这个话题的想法、要点、待办（自动保存）"
            : "your notes on this topic (auto-saves on blur)"
        }
        rows={4}
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm font-mono"
      />
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </section>
  );
}
