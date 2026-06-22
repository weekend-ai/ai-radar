"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function FetchButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  async function onClick() {
    setResult(null);
    const res = await fetch(`/api/sources/${sourceId}/fetch`, { method: "POST" });
    const json = await res.json();
    if (json.error) setResult(`✗ ${json.error.slice(0, 40)}`);
    else setResult(`+${json.inserted} (${json.duplicates} dup)`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded border border-border bg-black/40 px-3 py-1 text-xs hover:border-accent disabled:opacity-50"
      >
        {pending ? "..." : "Fetch now"}
      </button>
    </div>
  );
}
