"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * DraftEditor — bilingual draft editor with live markdown preview.
 *
 * Markdown rendering is dependency-free (no react-markdown) so we don't drag
 * extra weight into the bundle just for an MVP editor. We do enough escaping
 * + parsing to handle the actual layout assembleMarkdown emits.
 */
interface Props {
  id: string;
  initialTitleEn: string;
  initialTitleZh: string;
  initialSubjectEn: string;
  initialSubjectZh: string;
  initialBody: string;
  initialStatus: "draft" | "published";
  periodStart: string | null;
  periodEnd: string | null;
}

export function DraftEditor(props: Props) {
  const router = useRouter();
  const [titleEn, setTitleEn] = useState(props.initialTitleEn);
  const [titleZh, setTitleZh] = useState(props.initialTitleZh);
  const [subjectEn, setSubjectEn] = useState(props.initialSubjectEn);
  const [subjectZh, setSubjectZh] = useState(props.initialSubjectZh);
  const [body, setBody] = useState(props.initialBody);
  const [status, setStatus] = useState<"draft" | "published">(props.initialStatus);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = useMemo(() => renderMarkdown(body), [body]);

  const isDirty =
    titleEn !== props.initialTitleEn ||
    titleZh !== props.initialTitleZh ||
    subjectEn !== props.initialSubjectEn ||
    subjectZh !== props.initialSubjectZh ||
    body !== props.initialBody ||
    status !== props.initialStatus;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/drafts/${props.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titleEn,
          titleZh,
          subjectEn,
          subjectZh,
          bodyMarkdown: body,
          status,
        }),
      });
      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      setSavedAt(new Date());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/drafts/${props.id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      router.push("/drafts");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function copyMarkdown() {
    void navigator.clipboard.writeText(body);
  }

  function downloadMarkdown() {
    const safe = (titleEn || "newsletter").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openMailto() {
    const subject = subjectEn || titleEn || "Newsletter draft";
    // mailto URIs choke on very long bodies (browser/OS caps ~2K). Truncate
    // body and tell the user we did. Most clients will accept ~1800 chars.
    const max = 1500;
    const truncated = body.length > max;
    const payload = truncated ? `${body.slice(0, max)}\n\n[…truncated, copy full markdown]` : body;
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(payload)}`;
    window.location.href = href;
    if (truncated) {
      setError("Body truncated for mailto. Use 'Copy markdown' for the full text.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title (EN)" value={titleEn} onChange={setTitleEn} />
          <Field label="Title (ZH)" value={titleZh} onChange={setTitleZh} />
          <Field label="Subject (EN)" value={subjectEn} onChange={setSubjectEn} />
          <Field label="Subject (ZH)" value={subjectZh} onChange={setSubjectZh} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-muted" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className="rounded border border-border bg-bg px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
            <span className="text-xs text-muted">
              {props.periodStart?.slice(0, 10) ?? "—"} →{" "}
              {props.periodEnd?.slice(0, 10) ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyMarkdown}
              className="rounded border border-border px-3 py-1 text-sm hover:border-accent"
            >
              Copy markdown
            </button>
            <button
              type="button"
              onClick={downloadMarkdown}
              className="rounded border border-border px-3 py-1 text-sm hover:border-accent"
            >
              Download .md
            </button>
            <button
              type="button"
              onClick={openMailto}
              className="rounded border border-border px-3 py-1 text-sm hover:border-accent"
            >
              Mailto
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !isDirty}
              className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-50"
            >
              {busy ? "Saving…" : isDirty ? "Save" : "Saved"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded border border-red-500/40 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {savedAt ? (
          <p className="text-xs text-muted">Saved {savedAt.toLocaleTimeString()}</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-muted" htmlFor="body">
            Markdown source
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="h-[70vh] w-full rounded border border-border bg-bg p-3 font-mono text-xs leading-relaxed"
          />
        </div>
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">Preview</span>
          <div
            className="prose-newsletter h-[70vh] overflow-y-auto rounded border border-border bg-surface p-4 text-sm"
            // eslint-disable-next-line react/no-danger -- HTML is produced by our own escaped renderer below.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
      />
    </label>
  );
}

/**
 * Minimal markdown → HTML renderer.
 *
 * Handles: H1/H2/H3, blockquote, bullet list (with one level of nesting via
 * 2-space indent), bold/italic, inline links, horizontal rule, paragraphs.
 *
 * Escapes all input first so user/LLM text can never inject HTML. We re-emit
 * known markdown structure only.
 */
function renderMarkdown(src: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
        // Re-escape URL safely (escape already ran but quotes can sneak via attr)
        const safeUrl = url.replace(/"/g, "&quot;");
        return `<a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${label}</a>`;
      });

  const out: string[] = [];
  const lines = src.split(/\r?\n/);
  let inList = false;
  let inSubList = false;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(`<p>${inline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeLists = () => {
    if (inSubList) {
      out.push("</ul>");
      inSubList = false;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") {
      flushPara();
      closeLists();
      continue;
    }
    if (line === "---") {
      flushPara();
      closeLists();
      out.push("<hr />");
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      closeLists();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      closeLists();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      closeLists();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushPara();
      closeLists();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }
    if (/^  - /.test(line)) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      if (!inSubList) {
        out.push("<ul>");
        inSubList = true;
      }
      out.push(`<li>${inline(line.slice(4))}</li>`);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      if (inSubList) {
        out.push("</ul>");
        inSubList = false;
      }
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    // Default: accumulate paragraph
    closeLists();
    paraBuf.push(line);
  }
  flushPara();
  closeLists();
  return out.join("\n");
}
