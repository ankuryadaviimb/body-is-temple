"use client";

import { useEffect, useRef, useState } from "react";
import { editDocument, readDocument, refreshDocuments, removeDocument, shareDocumentFile, uploadDocument, UploadError, useDocuments, watchPendingReads } from "@/lib/client/records";
import { DOC_KIND_LABEL, DOC_KINDS, markerTrends, readIsStuck, readPolicy, type DocKind, type HealthDocument, type LabMarker, type MarkerPoint, type MarkerTrend } from "@/lib/domain/records";
import { AlertIcon, ChevronRightIcon, NoteIcon, PlusIcon } from "../icons";
import { Choice, Sheet } from "../sheet";
import { SectionTitle } from "../today/quick-tiles";
import { useToast } from "../toast";

/**
 * Health records: blood reports, consultations, prescriptions and scans in one private
 * place. AI reads the values only with the person's OK (the upload switch, or "Read with
 * AI"); names and details are removed first, and free text and photos go to Cloudflare only.
 */

function dateLabel(d: string | null): string {
  if (!d) return "No date";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const FLAG_STYLE: Record<LabMarker["flag"], { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-care/15 text-care" },
  high: { label: "High", cls: "bg-tip/15 text-tip" },
  normal: { label: "In range", cls: "bg-good/15 text-good" },
  unknown: { label: "No range", cls: "bg-surface-2 text-ink-3" },
};

/** What reading with AI sends, by type (shown next to the switch and the "Read" button). */
const READ_NOTE: Record<"results" | "free_text" | "photo", string> = {
  results:
    "Only the result lines are sent, after Temple removes the names, IDs and addresses it can find. They go to Groq (zero data retention) or Cloudflare, and neither keeps or trains on them.",
  free_text:
    "Free text like a consultation note can name you in ways Temple cannot always find. Temple removes the names and details it can find, and the rest goes to Cloudflare, which does not keep or train on it.",
  photo: "A photo is sent whole, to Cloudflare only, which does not keep or train on it. To leave your name out, crop the photo to the results first (Photos, Edit, Crop).",
};

function statusLine(d: HealthDocument, now: number): string {
  if (readIsStuck(d, now)) return "Reading stopped. Open it to try again.";
  if (d.status === "pending") return "Reading it...";
  if (d.status === "no_text") return "Scanned PDF: values not read. A photo of each page can be read instead.";
  if (d.status === "image") return "Photo: tap to read the values with AI";
  if (d.status === "consent") return "Stored. Tap to read the values with AI";
  if (d.status === "failed") return "Could not read it. Tap to try again.";
  const markers = d.extraction?.markers ?? [];
  if (markers.length > 0) {
    const out = markers.filter((m) => m.flag === "low" || m.flag === "high").length;
    return `${markers.length} ${markers.length === 1 ? "value" : "values"}${out ? `, ${out} outside the range` : ", all in range"}`;
  }
  return d.extraction?.summary[0] ?? "Stored";
}

export function RecordsScreen() {
  const docs = useDocuments();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [trend, setTrend] = useState<MarkerTrend | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void refreshDocuments().then((list) => {
      if (list?.some((d) => d.status === "pending")) watchPendingReads();
    });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const list = docs ?? [];
  const trends = markerTrends(list);
  const open = list.find((d) => d.id === openId) ?? null;

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Health records</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Reports and visits</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Blood reports, consultations, prescriptions and scans, in one private place. AI reads the values only when you say so.</p>
      </header>

      <button type="button" onClick={() => setAdding(true)} className="pressable -mt-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-semibold text-brand-ink">
        <PlusIcon className="size-5" /> Add a record
      </button>

      {trends.length > 0 ? (
        <section aria-label="Key results">
          <SectionTitle right={`${trends.length} tests`}>Latest results</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-card">
            {trends.slice(0, 12).map((t) => {
              const f = FLAG_STYLE[t.latest.flag];
              const arrow =
                t.previous && t.latest.value !== null && t.previous.value !== null && t.latest.value !== t.previous.value
                  ? t.latest.value > t.previous.value
                    ? "up"
                    : "down"
                  : null;
              return (
                <li key={t.name}>
                  <button type="button" onClick={() => setTrend(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{t.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {dateLabel(t.latest.date)}
                        {t.previous ? ` · before ${t.previous.value_text}${arrow ? ` (${arrow})` : ""}` : ""}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-right text-[15px] font-semibold">
                      {t.latest.value_text}
                      {t.latest.unit ? <span className="ml-1 text-[12px] font-normal text-ink-3">{t.latest.unit}</span> : null}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${f.cls}`}>{f.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-label="Records">
        <SectionTitle right={list.length ? `${list.length}` : undefined}>Records</SectionTitle>
        {docs === undefined ? (
          <div className="h-32 animate-pulse rounded-[22px] bg-surface" />
        ) : list.length === 0 ? (
          <p className="rounded-[22px] bg-surface p-4 text-[15px] leading-relaxed text-ink-2 shadow-card">
            Nothing yet. Add your last blood report: Temple reads the values, flags anything outside the range, and the coach takes it into account.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setOpenId(d.id)} className="pressable flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left shadow-card">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rest/15 text-rest">
                    <NoteIcon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{d.title}</span>
                    <span className="block text-[12px] text-ink-3">
                      {DOC_KIND_LABEL[d.kind]} · {dateLabel(d.doc_date)}
                    </span>
                    <span className={`mt-0.5 block text-[13px] leading-snug ${d.status === "pending" && !readIsStuck(d, now) ? "animate-pulse text-ink-3" : "text-ink-2"}`}>{statusLine(d, now)}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-[13px] leading-relaxed text-ink-3">
        Files stay in your private storage, and nothing is read by AI without your OK. For a blood report PDF, only its result lines are sent (Groq with zero data retention, or Cloudflare; neither keeps or trains on them). Consultations, prescriptions, scans and photos go to Cloudflare only. Not a diagnosis: discuss results with your doctor.
      </p>

      {adding ? <AddSheet onClose={() => setAdding(false)} /> : null}
      {open ? <DocSheet key={open.id} doc={open} onClose={() => setOpenId(null)} now={now} /> : null}
      {trend ? <TrendSheet trend={trend} onClose={() => setTrend(null)} /> : null}
    </main>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // One id per picked file: a retry of the same file finds it saved, a new file gets a new id.
  const [uploadId, setUploadId] = useState(() => crypto.randomUUID());
  const [kind, setKindState] = useState<DocKind>("blood_report");
  // The person's OK to read the values with AI. Defaults per type; a new file or type resets it.
  const [readChoice, setReadChoice] = useState<boolean | null>(null);
  const setKind = (k: DocKind) => {
    setKindState(k);
    setReadChoice(null);
  };
  const looksPdf = !file || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const policy = readPolicy(kind, looksPdf ? "application/pdf" : "image/jpeg");
  const readNow = readChoice ?? policy.defaultRead;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const saved = await uploadDocument(file, { kind, title: title.trim() || undefined, doc_date: date || null, notes: notes.trim() || null, read: readNow }, uploadId);
      show(saved.status === "pending" ? "Saved. Reading the values now." : "Saved. Open it to read the values.", "good");
      onClose();
      watchPendingReads();
    } catch (err) {
      show(err instanceof UploadError ? err.message : "Could not upload. Try again.", "tip");
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Add a record" onClose={onClose}>
      <button type="button" onClick={() => input.current?.click()} className="pressable mb-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-brand">
        {file ? `${file.name.slice(0, 40)} (${Math.max(1, Math.round(file.size / 1024))} KB), tap to change` : "Choose a PDF or a photo"}
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setUploadId(crypto.randomUUID());
          setReadChoice(null);
        }} />
      <Choice label="What is it?" value={kind} onChange={setKind} options={DOC_KINDS.map((k) => ({ value: k, label: DOC_KIND_LABEL[k] }))} />
      <label className="mb-4 block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Title (optional)</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${kind === "blood_report" ? "Full body checkup" : DOC_KIND_LABEL[kind]}`} className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] outline-none" />
      </label>
      <label className="mb-4 block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Date on the report (optional)</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px]" />
      </label>
      <label className="mb-5 block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Notes (optional)</span>
        <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Fasting sample, before starting B12" className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] outline-none" />
      </label>
      <div className="mb-5 rounded-2xl bg-surface-2 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold" id="read-now-label">
            Read the values with AI
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={readNow}
            aria-labelledby="read-now-label"
            onClick={() => setReadChoice(!readNow)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${readNow ? "bg-brand" : "bg-ink-3/40"}`}
          >
            <span className={`absolute left-0 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${readNow ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{READ_NOTE[policy.mode]}</p>
      </div>
      <button type="button" disabled={!file || busy} onClick={() => void upload()} className="pressable h-12 w-full rounded-2xl bg-brand text-[15px] font-semibold text-brand-ink disabled:opacity-50">
        {busy ? "Uploading..." : "Upload"}
      </button>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">PDF or photo, up to 4 MB. Photos are re-saved on this phone first, which removes location and device details.</p>
    </Sheet>
  );
}

function DocSheet({ doc, onClose, now }: { doc: HealthDocument; onClose: () => void; now: number }) {
  const { show } = useToast();
  const stuck = readIsStuck(doc, now);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [kind, setKind] = useState<DocKind>(doc.kind);
  const [title, setTitle] = useState(doc.title);
  const [date, setDate] = useState(doc.doc_date ?? "");
  const markers = doc.extraction?.markers ?? [];

  async function read(image: boolean) {
    try {
      await readDocument(doc.id, image);
      show("Reading it. Values appear in a few seconds.", "info");
      onClose();
    } catch {
      show("Could not reach the server. Try again when online.", "tip");
    }
  }

  return (
    <Sheet open title={doc.title} onClose={onClose}>
      <p className="mb-3 text-[14px] text-ink-2">
        {DOC_KIND_LABEL[doc.kind]} · {dateLabel(doc.doc_date)}
        {doc.pages ? ` · ${doc.pages} ${doc.pages === 1 ? "page" : "pages"}` : ""}
      </p>
      <div className="mb-4 flex gap-2.5">
        <a href={`/api/media/${doc.id}`} target="_blank" rel="noopener" className="pressable flex h-11 flex-1 items-center justify-center rounded-2xl bg-surface-2 text-[15px] font-semibold text-brand">
          Open the file
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await shareDocumentFile(doc);
            } catch {
              show("Could not get the file. Try again when online.", "tip");
            }
          }}
          className="pressable h-11 flex-1 rounded-2xl bg-surface-2 text-[15px] font-semibold text-brand"
        >
          Save or share
        </button>
      </div>

      {doc.status === "consent" ? (
        <div className="mb-4 rounded-2xl bg-surface-2 p-3.5">
          <p className="text-[14px] leading-relaxed">
            {READ_NOTE[readPolicy(doc.kind, doc.mime).mode]}
            {readPolicy(doc.kind, doc.mime).mode === "free_text" ? " You can also type the doctor's advice into the notes: the coach reads your notes." : ""}
          </p>
          <button type="button" onClick={() => void read(true)} className="pressable mt-2.5 h-10 w-full rounded-xl bg-brand text-[15px] font-semibold text-brand-ink">
            Read the values with AI
          </button>
        </div>
      ) : null}
      {doc.status === "image" ? (
        <div className="mb-4 rounded-2xl bg-surface-2 p-3.5">
          <p className="text-[14px] leading-relaxed">{READ_NOTE.photo}</p>
          <button type="button" onClick={() => void read(true)} className="pressable mt-2.5 h-10 w-full rounded-xl bg-brand text-[15px] font-semibold text-brand-ink">
            Read the values with AI
          </button>
        </div>
      ) : null}
      {doc.status === "failed" || doc.status === "no_text" || stuck ? (
        <button
          type="button"
          // A read only ever starts with the person's OK, so a retry carries it.
          onClick={() => void read(true)}
          className="pressable mb-4 h-11 w-full rounded-2xl bg-brand/15 text-[15px] font-semibold text-brand"
        >
          {stuck ? "This is taking too long. Try again" : "Try reading it again"}
        </button>
      ) : null}
      {doc.status === "pending" && !stuck ? <p className="mb-4 animate-pulse text-[14px] text-ink-3">Reading it...</p> : null}

      {doc.extraction && doc.extraction.summary.length > 0 ? (
        <div className="mb-4">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">In short</p>
          <ul className="flex flex-col gap-1.5">
            {doc.extraction.summary.map((s) => (
              <li key={s} className="flex gap-2.5 text-[15px] leading-relaxed">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {markers.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-2xl bg-surface-2">
          <table className="w-full text-left text-[13px]">
            <thead className="text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Test
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Result
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Range
                </th>
              </tr>
            </thead>
            <tbody>
              {markers.map((m, i) => (
                <tr key={`${m.name}-${i}`} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">
                    <span className="tabular">{m.value_text}</span> <span className="text-ink-3">{m.unit ?? ""}</span>
                    {m.flag === "low" || m.flag === "high" ? <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${FLAG_STYLE[m.flag].cls}`}>{FLAG_STYLE[m.flag].label}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-ink-3">{m.ref_text ?? (m.ref_low !== null || m.ref_high !== null ? `${m.ref_low ?? ""} to ${m.ref_high ?? ""}` : "-")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {markers.some((m) => m.flag === "low" || m.flag === "high") ? (
        <p className="mb-4 flex gap-2 text-[13px] leading-relaxed text-ink-2">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-tip" />
          Values outside the range are worth discussing with your doctor. One result alone is rarely the whole story.
        </p>
      ) : null}

      {editing ? (
        <div className="mb-4">
          <Choice label="What is it?" value={kind} onChange={setKind} options={DOC_KINDS.map((k) => ({ value: k, label: DOC_KIND_LABEL[k] }))} />
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="mb-3 h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] outline-none" aria-label="Title" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3 h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px]" aria-label="Date on the report" />
          <button
            type="button"
            disabled={!title.trim()}
            onClick={async () => {
              try {
                await editDocument(doc.id, { kind, title: title.trim(), doc_date: date || null });
                show("Saved.", "good");
                setEditing(false);
              } catch {
                show("Could not save. Try again when online.", "tip");
              }
            }}
            className="pressable h-11 w-full rounded-2xl bg-brand text-[15px] font-semibold text-brand-ink disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      ) : null}

      <div className="flex gap-2">
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="pressable h-11 flex-1 rounded-2xl bg-surface-2 text-[15px] font-semibold">
            Edit details
          </button>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            try {
              await removeDocument(doc.id);
              show("Record deleted.", "info");
              onClose();
            } catch {
              show("Could not delete. Try again when online.", "tip");
            }
          }}
          className="pressable h-11 flex-1 rounded-2xl bg-care/10 text-[15px] font-semibold text-care"
        >
          {confirmDelete ? "Tap again to delete for good" : "Delete"}
        </button>
      </div>
    </Sheet>
  );
}

type Numeric = MarkerPoint & { value: number };

/**
 * One marker over time. Dates are spaced to scale, and the reference range is shaded so a
 * small change is not drawn as a dramatic one: the scale always includes the range edge
 * nearest the results. Only results in the latest unit are drawn. The list below the
 * chart is its table view (every value, date and flag), so the chart itself is decorative.
 */
function TrendChart({ trend }: { trend: MarkerTrend }) {
  const pts = [...trend.comparable].reverse().filter((p): p is Numeric => p.value !== null);
  if (pts.length < 2) return null;
  const W = 320;
  const L = 6;
  const R = 314;
  const TOP = 12;
  const BOTTOM = 100;
  const day = (p: MarkerPoint) => Date.parse(`${p.date}T12:00:00Z`);
  const t0 = day(pts[0]);
  const tSpan = day(pts[pts.length - 1]) - t0;
  const x = (p: Numeric, i: number) => L + (tSpan > 0 ? (day(p) - t0) / tSpan : i / (pts.length - 1)) * (R - L);

  const values = pts.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const { ref_low: refLow, ref_high: refHigh } = trend.latest;
  if (refLow !== null && refHigh !== null) {
    if (hi < refLow) hi = refLow;
    else if (lo > refHigh) lo = refHigh;
    else {
      lo = Math.min(lo, refLow);
      hi = Math.max(hi, refHigh);
    }
  } else if (refLow !== null) {
    lo = Math.min(lo, refLow);
    hi = Math.max(hi, refLow);
  } else if (refHigh !== null) {
    lo = Math.min(lo, refHigh);
    hi = Math.max(hi, refHigh);
  }
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const y = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);

  const hasBand = refLow !== null || refHigh !== null;
  const bandTop = refHigh !== null ? Math.max(TOP, y(refHigh)) : TOP;
  const bandBottom = refLow !== null ? Math.min(BOTTOM, y(refLow)) : BOTTOM;

  const coords = pts.map((p, i) => ({ x: x(p, i), y: y(p.value) }));
  const last = coords[coords.length - 1];
  const prev = coords[coords.length - 2];
  // Put the end label on the side away from the incoming line.
  const labelBelow = prev.y < last.y ? last.y + 18 <= BOTTOM + 4 : last.y - 10 < TOP + 4;
  const labelY = labelBelow ? last.y + 18 : last.y - 10;
  const latest = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} 124`} className="mb-2 h-auto w-full" aria-hidden>
      {hasBand && bandBottom > bandTop ? <rect x={0} y={bandTop} width={W} height={bandBottom - bandTop} className="fill-surface-2" /> : null}
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        className="stroke-brand"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((c, i) => (
        <circle key={`${pts[i].doc_id}-${i}`} cx={c.x} cy={c.y} r={4.5} className="fill-brand stroke-surface" strokeWidth={2} />
      ))}
      <text x={Math.min(last.x, R) - 8} y={labelY} textAnchor="end" className="fill-ink" fontSize="13" fontWeight="600">
        {latest.value_text}
      </text>
      <text x={L} y={120} className="fill-ink-3" fontSize="11">
        {dateLabel(pts[0].date)}
      </text>
      <text x={R} y={120} textAnchor="end" className="fill-ink-3" fontSize="11">
        {dateLabel(latest.date)}
      </text>
    </svg>
  );
}

function TrendSheet({ trend, onClose }: { trend: MarkerTrend; onClose: () => void }) {
  const otherUnits = trend.points.length > trend.comparable.length;
  return (
    <Sheet open title={trend.name} onClose={onClose}>
      {trend.ref_text ? (
        <p className="mb-3 text-[14px] text-ink-2">
          Reference range: {trend.ref_text}
          {trend.comparable.filter((p) => p.value !== null).length >= 2 && (trend.latest.ref_low !== null || trend.latest.ref_high !== null) ? " (shaded)" : ""}
        </p>
      ) : null}
      <TrendChart trend={trend} />
      {otherUnits ? <p className="mb-2 text-[13px] leading-snug text-ink-3">Some results use a different unit, so they are listed but not compared.</p> : null}
      <ul className="divide-y divide-line">
        {trend.points.map((p) => (
          <li key={`${p.doc_id}-${p.date}-${p.value_text}`} className="flex items-center justify-between py-2.5 text-[15px]">
            <span className="text-ink-2">{dateLabel(p.date)}</span>
            <span className="flex items-center gap-2">
              <span className="tabular font-semibold">
                {p.value_text} <span className="text-[12px] font-normal text-ink-3">{p.unit ?? ""}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLAG_STYLE[p.flag].cls}`}>{FLAG_STYLE[p.flag].label}</span>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
