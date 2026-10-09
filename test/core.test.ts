import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wrapSelection,
  applyChanges,
  parseAnnotations,
  findAnnotationAt,
  findAnnotationById,
  removeAnnotationChanges,
  updateAnnotationChanges,
  excerptOf,
  lineOffset,
  encodeAttr,
  decodeAttr,
} from "../src/core.ts";

const S = (id = "k1", color = "yellow") => `<span class="ann-s" data-id="${id}" data-color="${color}"></span>`;
const E = (note = "N", id = "k1", color = "yellow") =>
  `<span class="ann-e" data-id="${id}" data-color="${color}" data-note="${note}"></span>`;

function annotate(doc: string, sel: string, note = "N", id = "k1", color = "yellow") {
  const from = doc.indexOf(sel);
  assert.ok(from >= 0, "selection must exist");
  const ch = wrapSelection(doc, from, from + sel.length, note, id, color);
  return ch ? applyChanges(doc, ch) : null;
}

test("single line", () => {
  assert.equal(annotate("今天讲一个工具。结尾。", "一个工具"), `今天讲${S()}一个工具${E()}。结尾。`);
});

test("color is stored on both markers", () => {
  assert.equal(annotate("abc", "abc", "N", "k1", "green"), `${S("k1", "green")}abc${E("N", "k1", "green")}`);
});

test("multi-line selection: one start, one end", () => {
  const out = annotate("第一行\n第二行\n第三行", "第一行\n第二行")!;
  assert.equal(out, `${S()}第一行\n第二行${E()}\n第三行`);
});

test("across paragraphs: note sits on the end marker", () => {
  const out = annotate("段一\n\n段二\n\n段三", "段一\n\n段二")!;
  assert.equal(out, `${S()}段一\n\n段二${E()}\n\n段三`);
  const anns = parseAnnotations(out);
  assert.equal(anns.length, 1);
  assert.equal(anns[0].note, "N");
});

test("start marker moves past list / heading prefixes", () => {
  const doc = "# 标题\n- 条目一\n- [ ] 条目二\n1. 条目三";
  const out = annotate(doc, doc)!;
  assert.equal(out, `# ${S()}标题\n- 条目一\n- [ ] 条目二\n1. 条目三${E()}`);
});

test("selection starting at a line start including the bullet", () => {
  const doc = "前\n- 条目";
  const from = doc.indexOf("- 条目");
  const out = applyChanges(doc, wrapSelection(doc, from, doc.length, "N", "k1")!);
  assert.equal(out, `前\n- ${S()}条目${E()}`);
});

test("code fences, tables and hr never hold a marker", () => {
  const doc = "```js\nlet a = 1\n```\n\n| a | b |\n|---|---|\n\n---\n\n正文";
  const out = annotate(doc, doc)!;
  assert.equal(out, doc.replace("正文", `${S()}正文${E()}`));
});

test("selection starting inside a code fence", () => {
  const doc = "```\ncode line\n```\n正文";
  const from = doc.indexOf("code line");
  const out = applyChanges(doc, wrapSelection(doc, from, doc.length, "N", "k1")!);
  assert.equal(out, `\`\`\`\ncode line\n\`\`\`\n${S()}正文${E()}`);
});

test("only code selected -> null", () => {
  assert.equal(wrapSelection("```\ncode\n```", 4, 8, "N", "k1"), null);
});

test("trailing whitespace stays outside the end marker", () => {
  const out = annotate("你好世界  \n下一行", "你好世界  ")!;
  assert.equal(out, `${S()}你好世界${E()}  \n下一行`);
});

test("note escaping round-trips and stays on one line", () => {
  const note = '含"引号" & <尖括号> [[链接]] $x$ 100% #标签 ==高亮== `代码`\n第二行';
  const enc = encodeAttr(note);
  assert.ok(!/["<>\n\[\]$%#=`]/.test(enc.replace(/&#\d+;/g, "")), "no raw specials left");
  assert.equal(decodeAttr(enc), note);
  const out = annotate("正文", "正文", note)!;
  assert.equal(parseAnnotations(out)[0].note, note);
  assert.equal(out.split("\n").length, 1);
});

test("parse: ranges, text and excerpt", () => {
  const out = annotate("甲 **乙**\n\n丙", "甲 **乙**\n\n丙", "备注")!;
  const [a] = parseAnnotations(out);
  assert.equal(a.id, "k1");
  assert.equal(out.slice(a.textFrom, a.textTo), "甲 **乙**\n\n丙");
  assert.equal(excerptOf(out, a), "甲 乙 丙");
});

test("findAnnotationAt / findAnnotationById", () => {
  const out = annotate("甲\n\n乙\n\n丙", "甲\n\n乙", "N")!;
  assert.equal(findAnnotationAt(out, out.indexOf("乙"))!.id, "k1");
  assert.equal(findAnnotationAt(out, out.indexOf("丙")), null);
  assert.equal(findAnnotationById(out, "k1")!.id, "k1");
  assert.equal(findAnnotationById(out, "zz"), null);
});

test("update note and color, then remove restores the original", () => {
  const doc = "甲\n\n乙";
  const out = annotate(doc, doc, "旧")!;
  const ann = parseAnnotations(out)[0];
  const edited = applyChanges(out, updateAnnotationChanges(ann, { note: "新", color: "blue" }));
  const [b] = parseAnnotations(edited);
  assert.equal(b.note, "新");
  assert.equal(b.color, "blue");
  assert.ok(edited.includes(S("k1", "blue")));
  assert.equal(applyChanges(edited, removeAnnotationChanges(b)), doc);
});

test("orphan markers are ignored; unknown color falls back", () => {
  const doc = `${S("a1")}只有开头 ${E("x", "b2", "weird")}`;
  assert.equal(parseAnnotations(doc).length, 0);
  const ok = `${S("c3")}文${E("x", "c3", "weird")}`;
  assert.equal(parseAnnotations(ok)[0].color, "yellow");
});

test("overlapping annotations are independent", () => {
  const first = annotate("一二三四五", "二三四", "A", "a1")!;
  const second = annotate(first, first, "B", "b2")!;
  const ids = parseAnnotations(second).map((a) => a.id).sort();
  assert.deepEqual(ids, ["a1", "b2"]);
  const b = parseAnnotations(second).find((a) => a.id === "b2")!;
  assert.equal(applyChanges(second, removeAnnotationChanges(b)), first);
});

test("lineOffset", () => {
  assert.equal(lineOffset("ab\ncd\nef", 0), 0);
  assert.equal(lineOffset("ab\ncd\nef", 2), 6);
  assert.equal(lineOffset("ab", 5), 2);
});

test("meta: time, author, resolved and replies round-trip", () => {
  const meta = {
    author: "李羡阳",
    time: "2026-10-09 13:36",
    resolved: true,
    replies: [{ author: "我", time: "2026-10-09 13:37", text: '回复 "一" [[x]]\n第二行' }],
  };
  const doc = "正文";
  const out = applyChanges(doc, wrapSelection(doc, 0, 2, "首次批注", "k1", "blue", meta)!);
  const [a] = parseAnnotations(out);
  assert.equal(a.note, "首次批注");
  assert.equal(a.author, "李羡阳");
  assert.equal(a.time, "2026-10-09 13:36");
  assert.equal(a.resolved, true);
  assert.deepEqual(a.replies, meta.replies);
  assert.ok(!out.includes('[['), "reply text must not leak raw wiki-link syntax");
});

test("update keeps meta; toggling resolved and adding a reply", () => {
  const doc = applyChanges("正文", wrapSelection("正文", 0, 2, "N", "k1", "yellow", { author: "A", time: "T" })!);
  const a = parseAnnotations(doc)[0];
  const next = applyChanges(doc, updateAnnotationChanges(a, { resolved: true, replies: [{ author: "B", time: "T2", text: "r" }] }));
  const b = parseAnnotations(next)[0];
  assert.equal(b.author, "A");
  assert.equal(b.time, "T");
  assert.equal(b.resolved, true);
  assert.equal(b.replies.length, 1);
  assert.equal(parseAnnotations(applyChanges(next, updateAnnotationChanges(b, { resolved: false })))[0].resolved, false);
});

test("legacy annotation without meta parses with defaults", () => {
  const [a] = parseAnnotations(`${S()}x${E()}`);
  assert.equal(a.time, "");
  assert.equal(a.resolved, false);
  assert.deepEqual(a.replies, []);
});
