// Pure logic: no Obsidian imports, so it can be unit-tested with plain node.
//
// Source format (works across lines, paragraphs, list items and headings):
//   <span class="ann-s" data-id="k3f9" data-color="yellow"></span>被批注的文字
//   ……<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="批注内容"></span>
// The start marker opens the range, the end marker closes it and carries the note.

export const COLORS = [
  { key: "yellow", label: "黄色", css: "#ffd000" },
  { key: "green", label: "绿色", css: "#3ec06a" },
  { key: "blue", label: "蓝色", css: "#4a9eff" },
  { key: "pink", label: "粉色", css: "#ff6fa5" },
  { key: "purple", label: "紫色", css: "#a67cff" },
  { key: "orange", label: "橙色", css: "#ff8a3d" },
] as const;

export const DEFAULT_COLOR = "yellow";

export function normalizeColor(c: string | null | undefined): string {
  return COLORS.some((x) => x.key === c) ? (c as string) : DEFAULT_COLOR;
}

export function colorCss(c: string): string {
  return COLORS.find((x) => x.key === c)?.css ?? COLORS[0].css;
}

export interface TagRange {
  from: number;
  to: number;
}

export interface Reply {
  author: string;
  time: string;
  text: string;
}

/** Optional per-annotation data stored on the end marker. */
export interface Meta {
  author?: string;
  time?: string;
  resolved?: boolean;
  replies?: Reply[];
}

export interface Annotation {
  id: string;
  color: string;
  note: string;
  author: string;
  /** "YYYY-MM-DD HH:mm", empty for annotations created by older versions */
  time: string;
  resolved: boolean;
  replies: Reply[];
  startTag: TagRange;
  endTag: TagRange;
  /** whole range, tags included */
  from: number;
  to: number;
  /** annotated text only, tags excluded */
  textFrom: number;
  textTo: number;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

const ESCAPE_RE = /[&"<>\n\r\[\]$%#=~`]/g;

/** Escape for an HTML attribute value. Also neutralises Obsidian-specific syntax ([[ ]], $, %%, #tag, ==). */
export function encodeAttr(s: string): string {
  return s.replace(ESCAPE_RE, (c) => (c === "\r" ? "" : `&#${c.charCodeAt(0)};`));
}

export function decodeAttr(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function newId(existing: Set<string> = new Set()): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
    if (!existing.has(id)) return id;
  }
}

export function startTag(id: string, color: string): string {
  return `<span class="ann-s" data-id="${id}" data-color="${normalizeColor(color)}"></span>`;
}

export function nowStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function encodeReplies(replies: Reply[]): string {
  return encodeAttr(JSON.stringify(replies.map((r) => ({ a: r.author, t: r.time, c: r.text }))));
}

function decodeReplies(raw: string | undefined): Reply[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(decodeAttr(raw));
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => ({ author: String(r?.a ?? ""), time: String(r?.t ?? ""), text: String(r?.c ?? "") }));
  } catch {
    return [];
  }
}

export function endTag(id: string, color: string, note: string, meta: Meta = {}): string {
  let extra = "";
  if (meta.author) extra += ` data-author="${encodeAttr(meta.author)}"`;
  if (meta.time) extra += ` data-time="${encodeAttr(meta.time)}"`;
  if (meta.resolved) extra += ` data-resolved="1"`;
  if (meta.replies?.length) extra += ` data-replies="${encodeReplies(meta.replies)}"`;
  return `<span class="ann-e" data-id="${id}" data-color="${normalizeColor(color)}" data-note="${encodeAttr(note)}"${extra}></span>`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const MARKER_RE = /<span\b[^>]*\bclass="ann-([se])"[^>]*><\/span>/g;

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

export function parseAnnotations(doc: string): Annotation[] {
  const starts = new Map<string, { from: number; to: number }>();
  const out: Annotation[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(doc))) {
    const tag = m[0];
    const id = attr(tag, "data-id");
    if (!id) continue;
    const range = { from: m.index, to: m.index + tag.length };
    if (m[1] === "s") {
      if (!starts.has(id)) starts.set(id, range);
    } else {
      const s = starts.get(id);
      if (!s) continue; // orphan end marker
      starts.delete(id);
      const noteRaw = attr(tag, "data-note");
      out.push({
        id,
        color: normalizeColor(attr(tag, "data-color") ?? attr(doc.slice(s.from, s.to), "data-color")),
        note: noteRaw === undefined ? "" : decodeAttr(noteRaw),
        author: decodeAttr(attr(tag, "data-author") ?? ""),
        time: decodeAttr(attr(tag, "data-time") ?? ""),
        resolved: attr(tag, "data-resolved") === "1",
        replies: decodeReplies(attr(tag, "data-replies")),
        startTag: s,
        endTag: range,
        from: s.from,
        to: range.to,
        textFrom: s.to,
        textTo: range.from,
      });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

export function findAnnotationAt(doc: string, offset: number): Annotation | null {
  let best: Annotation | null = null;
  for (const a of parseAnnotations(doc)) {
    if (offset >= a.from && offset <= a.to && (!best || a.to - a.from < best.to - best.from)) best = a;
  }
  return best;
}

export function findAnnotationById(doc: string, id: string): Annotation | null {
  return parseAnnotations(doc).find((a) => a.id === id) ?? null;
}

export function existingIds(doc: string): Set<string> {
  return new Set(parseAnnotations(doc).map((a) => a.id));
}

/** Character offset of the start of 0-based `line`. */
export function lineOffset(text: string, line: number): number {
  let off = 0;
  for (let i = 0; i < line; i++) {
    const nl = text.indexOf("\n", off);
    if (nl < 0) return text.length;
    off = nl + 1;
  }
  return off;
}

/** Short plain-text preview of the annotated text. */
export function excerptOf(doc: string, ann: Annotation, max = 80): string {
  let t = doc
    .slice(ann.textFrom, ann.textTo)
    .replace(/<span\b[^>]*\bclass="ann-[se]"[^>]*><\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*(?:>\s?)*(?:(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+)/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > max) t = t.slice(0, max) + "…";
  return t;
}

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

const PREFIX_RE = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/;
const FENCE_RE = /^[ \t]*(```|~~~)/;
const HR_RE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/;
const CALLOUT_RE = /^[ \t]*(?:>[ \t]?)*[ \t]*\[!/;

function fenceStateBefore(doc: string, offset: number): boolean {
  let inFence = false;
  const lineStart = doc.lastIndexOf("\n", offset - 1) + 1;
  for (const line of doc.slice(0, lineStart).split("\n")) {
    if (FENCE_RE.test(line)) inFence = !inFence;
  }
  return inFence;
}

/**
 * Insert a start marker and an end marker around doc[from, to).
 * The start marker is moved past list/heading/quote prefixes and the range never begins or ends inside
 * code fences, tables, horizontal rules or callout headers, so Markdown structure stays intact.
 * Returns null when nothing in the selection can be annotated.
 */
export function wrapSelection(
  doc: string,
  from: number,
  to: number,
  note: string,
  id: string,
  color: string = DEFAULT_COLOR,
  meta: Meta = {},
): TextChange[] | null {
  while (from < to && /\s/.test(doc[from])) from++;
  while (to > from && /\s/.test(doc[to - 1])) to--;
  if (from >= to) return null;

  let inFence = fenceStateBefore(doc, from);
  let startPos = -1;
  let endPos = -1;
  let ls = doc.lastIndexOf("\n", from - 1) + 1;

  while (ls < to) {
    let le = doc.indexOf("\n", ls);
    if (le < 0) le = doc.length;
    const line = doc.slice(ls, le);
    const trimmed = line.trim();

    let annotatable = true;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      annotatable = false;
    } else if (inFence || trimmed === "" || trimmed.startsWith("|") || HR_RE.test(line) || CALLOUT_RE.test(line)) {
      annotatable = false;
    }

    if (annotatable) {
      const prefixLen = PREFIX_RE.exec(line)![0].length;
      const lo = Math.max(ls, from, ls + prefixLen);
      let hi = Math.min(le, to);
      while (hi > lo && /\s/.test(doc[hi - 1])) hi--;
      if (lo < hi) {
        if (startPos < 0) startPos = lo;
        endPos = hi;
      }
    }
    ls = le + 1;
  }

  if (startPos < 0) return null;
  return [
    { from: startPos, to: startPos, insert: startTag(id, color) },
    { from: endPos, to: endPos, insert: endTag(id, color, note, meta) },
  ];
}

// ---------------------------------------------------------------------------
// Edit / remove
// ---------------------------------------------------------------------------

export function removeAnnotationChanges(ann: Annotation): TextChange[] {
  return [
    { from: ann.startTag.from, to: ann.startTag.to, insert: "" },
    { from: ann.endTag.from, to: ann.endTag.to, insert: "" },
  ];
}

export interface AnnotationPatch extends Meta {
  note?: string;
  color?: string;
}

export function updateAnnotationChanges(ann: Annotation, patch: AnnotationPatch): TextChange[] {
  const note = patch.note ?? ann.note;
  const color = patch.color ?? ann.color;
  const meta: Meta = {
    author: patch.author ?? ann.author,
    time: patch.time ?? ann.time,
    resolved: patch.resolved ?? ann.resolved,
    replies: patch.replies ?? ann.replies,
  };
  return [
    { from: ann.startTag.from, to: ann.startTag.to, insert: startTag(ann.id, color) },
    { from: ann.endTag.from, to: ann.endTag.to, insert: endTag(ann.id, color, note, meta) },
  ];
}

export function applyChanges(doc: string, changes: TextChange[]): string {
  let out = doc;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}
