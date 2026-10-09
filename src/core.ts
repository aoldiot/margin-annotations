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

const ESCAPE_RE = /[&"<>\n\r[\]$%#=~`|]/g;

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
    const arr: unknown = JSON.parse(decodeAttr(raw));
    if (!Array.isArray(arr)) return [];
    return arr.map((item: unknown) => {
      const r = (item ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      return { author: str(r.a), time: str(r.t), text: str(r.c) };
    });
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

interface FencedBlock {
  /** start of the opening fence line */
  from: number;
  /** end of the closing fence line (or end of document when unclosed) */
  to: number;
  /** blockquote / indentation prefix of the opening fence line */
  prefix: string;
}

/** The fenced code block that contains the whole selection [from, to], if any. */
function fencedBlockAround(doc: string, from: number, to: number): FencedBlock | null {
  let open: { ls: number; prefix: string } | null = null;
  let ls = 0;
  while (ls <= doc.length) {
    let le = doc.indexOf("\n", ls);
    if (le < 0) le = doc.length;
    const line = doc.slice(ls, le);
    if (FENCE_RE.test(line)) {
      if (!open) {
        open = { ls, prefix: /^[ \t>]*/.exec(line)![0] };
      } else {
        if (from >= open.ls && to <= le) return { from: open.ls, to: le, prefix: open.prefix };
        open = null;
      }
    }
    if (le >= doc.length) break;
    ls = le + 1;
  }
  if (open && from >= open.ls) return { from: open.ls, to: doc.length, prefix: open.prefix };
  return null;
}

/** Put the markers on lines of their own just outside the fences, so the code itself stays untouched. */
function wrapCodeBlock(doc: string, b: FencedBlock, note: string, id: string, color: string, meta: Meta): TextChange[] {
  const blank = b.prefix.trimEnd();
  const needsGap = b.from > 0 && doc.slice(doc.lastIndexOf("\n", b.from - 2) + 1, b.from - 1).trim() !== "";
  return [
    { from: b.from, to: b.from, insert: `${needsGap ? blank + "\n" : ""}${b.prefix}${startTag(id, color)}\n${blank}\n` },
    { from: b.to, to: b.to, insert: `\n${blank}\n${b.prefix}${endTag(id, color, note, meta)}` },
  ];
}

const TABLE_SEPARATOR_RE = /^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/;

/** A selection inside one table cell (same line, no pipe) is annotated as plain inline text. */
function tableCellRange(doc: string, from: number, to: number): TagRange | null {
  const ls = doc.lastIndexOf("\n", from - 1) + 1;
  let le = doc.indexOf("\n", from);
  if (le < 0) le = doc.length;
  if (to > le) return null;
  const line = doc.slice(ls, le);
  if (!line.trimStart().startsWith("|") || TABLE_SEPARATOR_RE.test(line)) return null;
  if (doc.slice(from, to).includes("|")) return null;
  return { from, to };
}

/**
 * What to annotate when nothing is selected: the table cell, code block or line under the cursor.
 * Returns null when there is no text there.
 */
export function rangeAtCursor(doc: string, offset: number): TagRange | null {
  const block = fencedBlockAround(doc, offset, offset);
  if (block) return { from: block.from, to: block.to };
  const ls = doc.lastIndexOf("\n", offset - 1) + 1;
  let le = doc.indexOf("\n", offset);
  if (le < 0) le = doc.length;
  const line = doc.slice(ls, le);
  if (TABLE_SEPARATOR_RE.test(line)) return null;
  let from = ls;
  let to = le;
  if (line.trimStart().startsWith("|")) {
    const rel = offset - ls;
    const left = line.lastIndexOf("|", Math.max(rel - 1, 0));
    const right = line.indexOf("|", rel);
    from = ls + left + 1;
    to = right < 0 ? le : ls + right;
  }
  const text = doc.slice(from, to);
  if (text.trim() === "" || HR_RE.test(text)) return null;
  return { from, to };
}

/**
 * Insert a start marker and an end marker around doc[from, to).
 * The start marker is moved past list/heading/quote prefixes and the range never begins or ends inside
 * code fences, tables, horizontal rules or callout headers, so Markdown structure stays intact.
 * Exceptions: a selection inside one table cell is wrapped as is, and a selection inside a fenced code block
 * annotates the whole block (markers go on their own lines just outside the fences).
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
  // never annotate (or reach into) the hidden agent guide
  const guide = findGuide(doc);
  if (guide) {
    if (from >= guide.from) return null;
    to = Math.min(to, guide.from);
  }
  while (from < to && /\s/.test(doc[from])) from++;
  while (to > from && /\s/.test(doc[to - 1])) to--;
  if (from >= to) return null;

  const block = fencedBlockAround(doc, from, to);
  if (block) return wrapCodeBlock(doc, block, note, id, color, meta);
  const cell = tableCellRange(doc, from, to);
  if (cell) {
    return [
      { from: cell.from, to: cell.from, insert: startTag(id, color) },
      { from: cell.to, to: cell.to, insert: endTag(id, color, note, meta) },
    ];
  }

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
  // Equal offsets: later entries are applied first so the final order matches the array order.
  const ordered = changes.map((c, i) => ({ c, i })).sort((a, b) => b.c.from - a.c.from || b.i - a.i);
  for (const { c } of ordered) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hidden usage guide for AI agents (an HTML comment kept in sync with the annotations)
// ---------------------------------------------------------------------------

export const GUIDE_START = "<!-- ann-guide:start";
export const GUIDE_END = "ann-guide:end -->";

// Written without complete marker tags, so parseAnnotations never mistakes it for an annotation.
export const AGENT_GUIDE = [
  GUIDE_START,
  "【重要】以下内容是写给 AI agent 的操作说明,由 Margin Annotations 插件自动维护。严禁删除、修改、移动或「整理」这段注释(包括 ann-guide:start 和 ann-guide:end 两行),否则批注功能的约定会丢失。",
  "",
  "本文档含「批注」。AI agent 处理批注的规则:",
  "1. 一条批注 = 同一个 data-id 的两个空 span 标记:class 为 ann-s 的是开头标记,class 为 ann-e 的是结尾标记,两者之间的文字就是被批注的原文。",
  "   批注内容在结尾标记的 data-note 属性,讨论记录在 data-replies 属性(JSON 数组,a=答复人、t=时间、c=内容)。",
  "2. 只处理未解决的批注,即结尾标记上没有 data-resolved=\"1\" 的批注;不要改动没有批注的内容。",
  "3. 按批注意见(以及 data-replies 里的讨论)修改被批注的原文。",
  "4. 修改完成后,必须在该批注的结尾标记上加上 data-resolved=\"1\",把它标为已解决。不要删除批注的开头/结尾标记。",
  "   取消解决 = 删除该标记上的 data-resolved=\"1\"。",
  "5. 如果对批注或要怎么改有疑问,不要擅自修改,也不要标为已解决:在该结尾标记的 data-replies 末尾追加一条答复,",
  "   例如 {\"a\":\"AI\",\"t\":\"2026-01-01 12:00\",\"c\":\"我的疑问\"}(时间格式 YYYY-MM-DD HH:mm);还没有 data-replies 时新建这个属性。",
  "6. 属性值要做 HTML 实体转义:双引号写成 &#34;,& 写成 &amp;,< 写成 &lt;,> 写成 &gt;,换行写成 &#10;,",
  "   并把 [ ] | # $ % = ` ~ 分别写成 &#91; &#93; &#124; &#35; &#36; &#37; &#61; &#96; &#126;。",
  "",
  "【再次提醒】这段说明是给 AI agent 看的,请原样保留,不要删除或修改。",
  GUIDE_END,
].join("\n");

/** Offset of the guide inside `doc` as [from, to), or null. */
export function findGuide(doc: string): TagRange | null {
  const start = doc.indexOf(GUIDE_START);
  if (start < 0) return null;
  const endAt = doc.indexOf(GUIDE_END, start);
  return endAt < 0 ? null : { from: start, to: endAt + GUIDE_END.length };
}

/**
 * Changes that keep the guide at the very end of the note while it has annotations,
 * and remove it once the last annotation is gone.
 */
export function guideChanges(doc: string, annotationCount: number): TextChange[] {
  const g = findGuide(doc);
  if (annotationCount === 0) {
    if (!g) return [];
    // also drop the newline after the guide and one of the blank lines before it
    const to = doc[g.to] === "\n" ? g.to + 1 : g.to;
    const from = doc[g.from - 1] === "\n" ? g.from - 1 : g.from;
    return [{ from, to, insert: "" }];
  }
  if (g && g.to === doc.trimEnd().length && doc.slice(g.from, g.to) === AGENT_GUIDE) return [];

  const changes: TextChange[] = [];
  let rest = doc;
  if (g) {
    // outdated or misplaced guide: take it out (with the blank line after it) and re-add it at the end
    let to = g.to;
    for (let n = 0; n < 2 && doc[to] === "\n"; n++) to++;
    changes.push({ from: g.from, to, insert: "" });
    rest = doc.slice(0, g.from) + doc.slice(to);
  }
  const gap = rest.length === 0 || rest.endsWith("\n\n") ? "" : rest.endsWith("\n") ? "\n" : "\n\n";
  changes.push({ from: doc.length, to: doc.length, insert: `${gap}${AGENT_GUIDE}\n` });
  return changes;
}

/**
 * `changes` plus whatever is needed to keep the guide in sync with the resulting annotation count.
 * The guide changes come last so that, at equal offsets, an annotation's end marker precedes the guide.
 */
export function withGuide(doc: string, changes: TextChange[]): TextChange[] {
  const count = parseAnnotations(applyChanges(doc, changes)).length;
  return [...changes, ...guideChanges(doc, count)];
}
