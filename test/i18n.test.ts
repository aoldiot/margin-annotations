import { test } from "node:test";
import assert from "node:assert/strict";
import { STRINGS } from "../src/i18n.ts";

test("i18n: en and zh dictionaries cover the same keys", () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.zh).sort());
});

test("i18n: color names cover the same keys in both languages", () => {
  assert.deepEqual(Object.keys(STRINGS.en.colors).sort(), Object.keys(STRINGS.zh.colors).sort());
});

test("i18n: no empty strings", () => {
  for (const [locale, dict] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === "string") {
        assert.ok(value.length > 0, `${locale}.${key} must not be empty`);
      } else {
        for (const [color, name] of Object.entries(value)) {
          assert.ok(name.length > 0, `${locale}.colors.${color} must not be empty`);
        }
      }
    }
  }
});
