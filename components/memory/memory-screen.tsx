"use client";

import { useEffect, useState } from "react";
import { refreshMemory, rememberFact, saveMemoryNote, useMemory } from "@/lib/client/coach";
import { MEMORY_MAX_CHARS, MEMORY_META, MEMORY_SLUGS, type MemoryFile, type MemorySlug } from "@/lib/domain/memory";
import { PencilIcon, PlusIcon } from "../icons";
import { Sheet } from "../sheet";
import { SectionTitle } from "../today/quick-tiles";
import { useToast } from "../toast";

/** "What Temple knows about you": the notes the coach reads, all editable. */

export function MemoryScreen() {
  const files = useMemory();
  const { show } = useToast();
  const [editing, setEditing] = useState<MemorySlug | null>(null);
  const [fact, setFact] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refreshMemory();
  }, []);

  const bySlug = new Map((files ?? []).map((f) => [f.slug, f]));

  async function remember() {
    const text = fact.trim();
    if (text.length < 3) return;
    setSaving(true);
    try {
      await rememberFact(text);
      setFact("");
      show("Saved. The coach will use it from now on.", "good");
    } catch {
      show("Could not save. Check your connection and try again.", "tip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Coach memory</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">What Temple knows</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          The coach reads these notes before it answers. Fix anything that is wrong. Patterns from your logs are worked out separately and never written here.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void remember();
        }}
        className="flex items-center gap-2 rounded-[22px] bg-surface p-2 pl-4 shadow-card"
      >
        <label htmlFor="remember" className="sr-only">
          Something to remember
        </label>
        <input
          id="remember"
          type="text"
          enterKeyHint="done"
          maxLength={300}
          value={fact}
          onChange={(e) => setFact(e.target.value)}
          placeholder="Remember: milk makes me bloated"
          className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={saving || fact.trim().length < 3}
          aria-label="Remember this"
          className="pressable flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink disabled:bg-surface-2 disabled:text-ink-3"
        >
          <PlusIcon className="size-5" />
        </button>
      </form>

      <section aria-label="Notes">
        <SectionTitle>Notes</SectionTitle>
        {files === undefined ? (
          <div className="h-64 animate-pulse rounded-[22px] bg-surface" />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {MEMORY_SLUGS.map((slug) => (
              <li key={slug}>
                <NoteRow slug={slug} file={bySlug.get(slug)} onEdit={() => setEditing(slug)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-[13px] leading-relaxed text-ink-3">
        Every change is kept as a new version. Notes stay in your own database and go only to the AI providers that do not train on your data.
      </p>

      {editing ? <EditSheet key={editing} slug={editing} file={bySlug.get(editing)} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}

function NoteRow({ slug, file, onEdit }: { slug: MemorySlug; file: MemoryFile | undefined; onEdit: () => void }) {
  const meta = MEMORY_META[slug];
  const lines = (file?.content ?? "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  return (
    <button type="button" onClick={onEdit} className="pressable w-full rounded-[22px] bg-surface p-4 text-left shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold tracking-tight">{meta.title}</span>
        <span className="flex items-center gap-1 text-[13px] text-ink-3">
          {file && file.version > 1 ? `v${file.version}` : null}
          <PencilIcon className="size-4" />
        </span>
      </div>
      {lines.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {lines.slice(0, 3).map((l) => (
            <li key={l} className="line-clamp-2 text-[14px] leading-relaxed text-ink-2">
              {l}
            </li>
          ))}
          {lines.length > 3 ? <li className="text-[13px] text-ink-3">and {lines.length - 3} more</li> : null}
        </ul>
      ) : (
        <p className="mt-1 text-[14px] text-ink-3">{meta.hint} Empty, tap to add.</p>
      )}
    </button>
  );
}

function EditSheet({ slug, file, onClose }: { slug: MemorySlug; file: MemoryFile | undefined; onClose: () => void }) {
  const { show } = useToast();
  const [value, setValue] = useState(file?.content ?? "");
  const [saving, setSaving] = useState(false);
  const meta = MEMORY_META[slug];
  const dirty = value !== (file?.content ?? "");
  return (
    <Sheet open title={meta.title} onClose={onClose}>
      <p className="mb-3 text-[14px] text-ink-2">{meta.hint} One fact per line works best.</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MEMORY_MAX_CHARS))}
        rows={12}
        className="w-full resize-none rounded-2xl bg-surface-2 p-3.5 text-[16px] leading-relaxed outline-none"
        aria-label={meta.title}
      />
      <div className="mt-1 flex justify-end text-[12px] text-ink-3 tabular">
        {value.length.toLocaleString("en-IN")} / {MEMORY_MAX_CHARS.toLocaleString("en-IN")}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onClose} className="pressable h-12 flex-1 rounded-2xl bg-surface-2 text-[15px] font-semibold">
          Cancel
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveMemoryNote(slug, value);
              show("Saved. A new version is kept.", "good");
              onClose();
            } catch {
              show("Could not save. Check your connection and try again.", "tip");
            } finally {
              setSaving(false);
            }
          }}
          className="pressable h-12 flex-1 rounded-2xl bg-brand text-[15px] font-semibold text-brand-ink disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </Sheet>
  );
}
