// Unread tracking, pure logic: no Obsidian imports, so it can be unit-tested with plain node.
//
// Every comment (an annotation's own note, and each reply) gets a stable key. A device keeps the set of keys
// it has seen; a comment is unread when someone other than this device's author wrote it and its key is not
// in that set. Keys leave out the note path so renaming a note doesn't make its comments unread again.

import type { Annotation, Reply } from "./core";

export interface CommentItem {
  key: string;
  path: string;
  annId: string;
  author: string;
  time: string;
  text: string;
  /** index into the annotation's replies, -1 for the annotation's own note */
  reply: number;
}

/** 32-bit FNV-1a, hex: short and stable, enough to tell same-minute replies apart. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The annotation's own note. Its text is left out of the key so editing a comment doesn't make it unread
 * again; id + author + minute is unique enough in practice.
 */
export function annotationKey(a: Annotation): string {
  return `${a.id}|${a.author}|${a.time}`;
}

/** Replies can't be edited, only deleted, so their text can safely be part of the key. */
export function replyKey(a: Annotation, r: Reply): string {
  return `${a.id}|r|${r.author}|${r.time}|${hash(r.text)}`;
}

export function commentItems(path: string, anns: Annotation[]): CommentItem[] {
  const out: CommentItem[] = [];
  for (const a of anns) {
    if (a.note.trim()) {
      out.push({ key: annotationKey(a), path, annId: a.id, author: a.author, time: a.time, text: a.note, reply: -1 });
    }
    a.replies.forEach((r, i) => {
      out.push({ key: replyKey(a, r), path, annId: a.id, author: r.author, time: r.time, text: r.text, reply: i });
    });
  }
  return out;
}

/** Author names typed on different devices may differ in Unicode normalization ("ş" composed or not). */
export function sameAuthor(a: string, b: string): boolean {
  return a.normalize("NFC").trim() === b.normalize("NFC").trim();
}

export function isUnread(item: CommentItem, me: string, seen: ReadonlySet<string>): boolean {
  return !sameAuthor(item.author, me) && !seen.has(item.key);
}

/** Newest first; comments from older versions without a timestamp go last. */
export function byNewest(a: CommentItem, b: CommentItem): number {
  return b.time.localeCompare(a.time);
}

/** One-line excerpt of a comment for notices and lists. */
export function excerpt(text: string, max = 100): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
