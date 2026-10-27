import { test } from "node:test";
import assert from "node:assert/strict";
import { endTag, parseAnnotations, startTag } from "../src/core.ts";
import type { Reply } from "../src/core.ts";
import { commentItems, excerpt, isUnread, sameAuthor } from "../src/unread.ts";

function doc(id: string, note: string, author: string, time: string, replies: Reply[] = []) {
  return `${startTag(id, "yellow")}text${endTag(id, "yellow", note, { author, time, replies })}`;
}

test("unread: one item per note and per reply", () => {
  const anns = parseAnnotations(
    doc("k1", "Note", "Neşe", "2026-10-26 10:00", [
      { author: "Mike", time: "2026-10-26 10:05", text: "Reply A" },
      { author: "Neşe", time: "2026-10-26 10:05", text: "Reply B" },
    ]),
  );
  const items = commentItems("a.md", anns);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.reply), [-1, 0, 1]);
  assert.equal(new Set(items.map((i) => i.key)).size, 3, "same-minute replies get distinct keys");
});

test("unread: editing a note keeps its key, renaming the file keeps all keys", () => {
  const before = commentItems("a.md", parseAnnotations(doc("k1", "Old", "Neşe", "2026-10-26 10:00")));
  const after = commentItems("b.md", parseAnnotations(doc("k1", "Edited", "Neşe", "2026-10-26 10:00")));
  assert.equal(before[0].key, after[0].key);
});

test("unread: own comments and seen comments are not unread", () => {
  const items = commentItems(
    "a.md",
    parseAnnotations(doc("k1", "Note", "Neşe", "2026-10-26 10:00", [{ author: "Mike", time: "2026-10-26 10:01", text: "Mine" }])),
  );
  const [note, reply] = items;
  assert.equal(isUnread(note, "Mike", new Set()), true);
  assert.equal(isUnread(reply, "Mike", new Set()), false, "own reply");
  assert.equal(isUnread(note, "Mike", new Set([note.key])), false, "already seen");
  assert.equal(isUnread(note, "Neşe", new Set()), false, "own note from the other side");
});

test("unread: author names match across Unicode normalization", () => {
  assert.equal(sameAuthor("Neşe", "Neşe"), true);
  assert.equal(sameAuthor(" Mike ", "Mike"), true);
  assert.equal(sameAuthor("Mike", "Neşe"), false);
});

test("unread: empty notes produce no item", () => {
  const anns = parseAnnotations(`${startTag("k1", "yellow")}t${endTag("k1", "yellow", "", { author: "Neşe" })}`);
  assert.equal(commentItems("a.md", anns).length, 0);
});

test("unread: excerpt flattens whitespace and truncates", () => {
  assert.equal(excerpt("a\n\n b   c"), "a b c");
  assert.equal(excerpt("x".repeat(10), 5), "xxxx…");
});
