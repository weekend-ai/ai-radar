"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/lib/i18n";
import { MergeDialog } from "./merge-dialog";
import { SplitDialog } from "./split-dialog";

type MergeCandidate = { id: string; titleEn: string | null; articleCount: number; finalScore: number | null };
type Member = { articleId: string; title: string };

/**
 * Toolbar of mutation actions for the topic detail page.
 *
 * The simple actions (archive / unarchive / promote) hit their dedicated
 * routes directly. Merge and Split open modal dialogs that handle the
 * multi-select UI and POST themselves.
 *
 * All actions call router.refresh() on success so the server-rendered page
 * re-fetches and shows new state. Errors land in an inline banner.
 */
export function ActionsPanel({
  topicId,
  status,
  articleCount,
  lang,
  mergeCandidates,
  members,
}: {
  topicId: string;
  status: string;
  articleCount: number;
  lang: Lang;
  mergeCandidates: MergeCandidate[];
  members: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  async function call(url: string, method: "POST" | "DELETE" = "POST") {
    setError(null);
    const res = await fetch(url, { method });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `${method} ${url} failed (${res.status})`);
      return false;
    }
    return true;
  }

  function onArchive() {
    startTransition(async () => {
      if (await call(`/api/topics/${topicId}/archive`, "POST")) router.refresh();
    });
  }
  function onUnarchive() {
    startTransition(async () => {
      if (await call(`/api/topics/${topicId}/archive`, "DELETE")) router.refresh();
    });
  }
  function onPromote() {
    startTransition(async () => {
      if (await call(`/api/topics/${topicId}/promote`, "POST")) router.refresh();
    });
  }

  const labels = {
    promote: lang === "zh" ? (status === "selected" ? "取消选中" : "选入下期") : status === "selected" ? "Unpromote" : "Promote",
    archive: lang === "zh" ? "归档" : "Archive",
    unarchive: lang === "zh" ? "取消归档" : "Unarchive",
    merge: lang === "zh" ? "合并其他话题进来" : "Merge in…",
    split: lang === "zh" ? "拆分成新话题" : "Split…",
  };

  const canPromote = status === "open" || status === "selected";
  const canArchive = status !== "archived" && status !== "merged";
  const canMerge = canPromote && mergeCandidates.length > 0;
  const canSplit = canPromote && articleCount >= 2;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canPromote ? (
          <button
            type="button"
            onClick={onPromote}
            disabled={pending}
            className={
              status === "selected"
                ? "rounded border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 disabled:opacity-50"
                : "rounded border border-accent bg-accent/10 px-3 py-1 text-xs text-accent disabled:opacity-50"
            }
          >
            {labels.promote}
          </button>
        ) : null}
        {canMerge ? (
          <button
            type="button"
            onClick={() => setMergeOpen(true)}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-50"
          >
            {labels.merge}
          </button>
        ) : null}
        {canSplit ? (
          <button
            type="button"
            onClick={() => setSplitOpen(true)}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-50"
          >
            {labels.split}
          </button>
        ) : null}
        {canArchive ? (
          <button
            type="button"
            onClick={onArchive}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-xs text-muted hover:border-red-500 hover:text-red-300 disabled:opacity-50"
          >
            {labels.archive}
          </button>
        ) : null}
        {status === "archived" ? (
          <button
            type="button"
            onClick={onUnarchive}
            disabled={pending}
            className="rounded border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-50"
          >
            {labels.unarchive}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : null}
      {mergeOpen ? (
        <MergeDialog
          survivorId={topicId}
          candidates={mergeCandidates}
          lang={lang}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {splitOpen ? (
        <SplitDialog
          sourceTopicId={topicId}
          members={members}
          lang={lang}
          onClose={() => setSplitOpen(false)}
          onSplit={(newTopicId) => {
            setSplitOpen(false);
            router.push(`/topics/${newTopicId}` as never);
          }}
        />
      ) : null}
    </div>
  );
}
