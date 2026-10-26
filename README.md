# Margin Annotations

**English** | [简体中文](README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/aoldiot/margin-annotations?style=flat-square)](https://github.com/aoldiot/margin-annotations/releases/latest)
[![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22margin-annotations%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square)](https://community.obsidian.md/plugins/margin-annotations)
[![License](https://img.shields.io/github/license/aoldiot/margin-annotations?style=flat-square)](LICENSE)

**Word-style comments for Obsidian, stored right in the Markdown source, so an AI agent can read and act on them.**

Select text, write a comment in the sidebar, reply to it, resolve it. Every annotation and reply carries an author and a timestamp. Because each annotation is just a pair of `<span>` markers in the note, agents such as Claude Code or Codex see exactly which text you meant and what you want changed. No export, no copy and paste, no API.

![Margin Annotations: highlighted text in the note, annotation cards in the right sidebar](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/hero.png)

> **About the interface language:** the plugin's own UI (sidebar, menus, commands, settings) is currently in Chinese. This README gives the English meaning of each label, and [UI labels](#ui-labels) at the end lists them all.

## Video walkthrough

A 3-minute tour: the idea, a real annotate-and-hand-over round with Claude Code, and installation (Chinese narration).

[![Watch the video walkthrough](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/video-poster.jpg)](https://github.com/aoldiot/margin-annotations/blob/main/docs/media/demo.mp4)

## Why

An AI can write a draft in a minute, but getting it right can mean ten separate fixes, and each one is copy, paste, explain, repeat. A teacher marking an essay does not call you over sentence by sentence: they circle the problem, write a note in the margin, and hand back the whole thing at once.

Margin Annotations brings that to your notes:

1. **Annotate** while you read: select text, write what is wrong.
2. **Hand over once:** tell your agent to handle the annotations in the file.
3. **Review:** the agent edits the text and marks each annotation as resolved. If something is unclear it replies on the card instead of guessing. You reopen what is not right, or answer, and go another round.

## Features

- Annotate any selection, including across lines, paragraphs, list items and headings.
- Six highlight colors (yellow, green, blue, pink, purple, orange), changeable per annotation.
- Word-style sidebar in Obsidian's right dock: cards sit next to the text they annotate and scroll with the note.
- Threaded replies, resolve / unresolve, edit, recolor, delete. Author and timestamp on everything.
- Works in live preview, source mode and reading view. Annotations can only be *added* in editing mode.
- Tables, code blocks and rendered callouts are supported (see [Tables, callouts and code blocks](#tables-callouts-and-code-blocks)).
- A hidden guide at the end of the note tells agents how to use the annotations, so a one-line prompt is enough.
- Changes made to the file from outside, by an agent for example, show up in the sidebar without reopening the note.

### Add, reply, resolve

Select text and run **添加批注** (*Add annotation*), from the command palette, a hotkey, or the right-click menu. A card opens in the sidebar: write the comment, pick a color, press `Cmd/Ctrl + Enter` (or just click elsewhere, a draft with text is saved automatically).

Click a card to reply to it. The **⋯** menu on a card has reply, resolve, edit, change color and delete. Resolved annotations are dimmed and get a **已解决** (*Resolved*) badge.

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/add-annotation.png" alt="A new annotation card with a text box, six color swatches and Cancel / Save buttons"></td>
<td width="50%"><img src="https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/card-menu.png" alt="An annotation card with a reply thread and the ⋯ menu open: Reply, Resolve, Edit, Change color, Delete"></td>
</tr>
<tr>
<td align="center">Writing a new annotation</td>
<td align="center">Reply thread and the ⋯ menu</td>
</tr>
</table>

You do not have to select text first. With nothing selected, **Add annotation** annotates the table cell, code block or line under the cursor.

### Tables, callouts and code blocks

![An annotated table cell, an annotated callout and an annotated code block, with their cards in the sidebar](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/blocks.png)

- **Tables:** select text inside a single cell. Selections that span cells or rows are not supported.
- **Callouts:** in live preview, text selected in a callout you have not clicked into (still rendered) can be annotated directly, with no need to enter edit mode.
- **Code blocks:** select anything inside a fenced code block to annotate the **whole block**. The markers go on their own lines just outside the fences, so the code itself is untouched.
- Horizontal rules are skipped automatically.

### Reading view

Reading view shows the highlights and a small 💬 button at the end of each annotation. Click it to see the comment, with **编辑** (*Edit*) and **删除** (*Delete*) buttons. Right-clicking a highlight opens the same menu as the sidebar. The sidebar works in reading view too.

![Reading view with highlights and an open comment popover](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/reading-mode.png)

## Working with AI agents

The annotations live in the note, so any agent that can read and edit files can handle them. In Claude Code, for example, referencing the file is enough:

```
@draft.md address the annotations in this note
```

The plugin writes a hidden guide at the end of every note that has annotations (see [the guide](#the-hidden-agent-guide)), so the agent already knows the rules:

- only unresolved annotations are handled, and text without annotations is left alone;
- the text is revised according to the note and the reply thread;
- when it is done, the agent adds `data-resolved="1"` to the annotation, which turns the card to **已解决** (*Resolved*) in the sidebar. The markers stay;
- when something is unclear it does not edit. It appends a reply to the annotation instead, which shows up as a reply on the card. You answer on the card, like a chat, and the agent sees the whole thread next time.

A more explicit prompt, if your agent does not pick the guide up:

```
Read every <span class="ann-e" ... data-note="..."> annotation in draft.md.
The text an annotation refers to lies between the ann-s and ann-e markers with the same data-id.
Skip annotations with data-resolved="1". Revise the text according to each note (and its data-replies discussion),
then add data-resolved="1" to that annotation's ann-e marker. Keep the markers.
If a note is unclear, do not edit: append a reply to data-replies instead.
Do not touch text without annotations.
```

Resolved annotations are skipped in the next round, so text that is already fixed does not get rewritten again. To redo one, choose **取消解决** (*Unresolve*) on the card and add a reply.

## Installation

**From the Community Plugins browser**

1. Open **Settings → Community plugins**. If Restricted mode is on, turn it off.
2. Select **Browse**, search for "Margin Annotations", then **Install** and **Enable**. Or open the [plugin page](https://community.obsidian.md/plugins/margin-annotations).

**Manual installation**

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/aoldiot/margin-annotations/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/margin-annotations/`.
3. Reload Obsidian and enable **Margin Annotations** under **Settings → Community plugins**.

Requires Obsidian 1.7.2 or later.

## Setup

Open the plugin's settings (**Settings → Margin Annotations**).

![The plugin settings tab](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/settings.png)

| Setting | What it does | Default |
|---|---|---|
| **默认批注颜色** (Default color) | Color preselected for new annotations. | Yellow |
| **批注人名称** (Author name) | Shown on your annotations and replies. Empty shows「我」("me"). | Empty |
| **批注跟随正文** (Cards follow the note) | On: cards sit next to their text and scroll with the note. Off: a plain list in note order, and clicking a card jumps to its text. | On |
| **实时预览中隐藏批注标记** (Hide markup in live preview) | Hides the `<span>` markers and the agent guide in live preview. Source mode always shows the raw text. | On |
| **添加批注快捷键** (Add-annotation hotkey) | Shows the current binding. The button jumps to Obsidian's Hotkeys settings. | Not set |

**Bind a hotkey for Add annotation**, since the command has none by default: select **设置快捷键** (*Set hotkey*), or go to **Settings → Hotkeys** and search for "批注" or "Margin Annotations". Without a hotkey the right-click menu still works, only slower.

## Usage

| Action | How |
|---|---|
| Add | Select text, run **添加批注**, type in the sidebar card, `Cmd/Ctrl + Enter` |
| Reply | Click a card, type in the reply box, press `Enter` (`Shift + Enter` for a new line) |
| Resolve / unresolve | **⋯** menu on the card, or the right-click menu on the highlight |
| Edit, change color | **⋯** menu on the card |
| Delete | **⋯** menu, or `Delete` / `Backspace` with a card selected, or the command **删除选中的批注**. Only the markers are removed, your text is untouched |
| Cancel a draft | `Esc`, or the **取消** button |
| Deselect | Click empty space in the sidebar |
| Open / close the sidebar | Ribbon icon, or the command **打开/关闭批注栏** (the sidebar also opens when you add an annotation) |

Moving the cursor into annotated text selects its card, and clicking a highlight in reading view does the same. With **批注跟随正文** on, scrolling the sidebar scrolls the note.

**Commands:**

| Command | Meaning |
|---|---|
| 添加批注 | Add annotation |
| 编辑光标处批注 | Edit the annotation at the cursor |
| 删除选中的批注 | Delete the selected annotation |
| 打开/关闭批注栏 | Open / close the annotation sidebar |

Annotations cannot be created in reading view, because reading view cannot be reliably mapped back to the source. Switch to editing mode to add them.

## File format

One annotation is a start marker, the annotated text and an end marker. The comment lives on the end marker's `data-note` attribute. In source mode it looks like this (the markers are faded):

![Source mode showing the span markers around annotated text](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/source-markup.png)

```html
<span class="ann-s" data-id="k3f9" data-color="yellow"></span>Annotated text, possibly spanning several paragraphs.
Last line.<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="Too formal, make it conversational" data-author="Alex" data-time="2026-10-09 13:36" data-resolved="1" data-replies="[{&#34;a&#34;:&#34;Alex&#34;,&#34;t&#34;:&#34;2026-10-09 13:37&#34;,&#34;c&#34;:&#34;Done&#34;}]"></span>
```

| Attribute | Meaning |
|---|---|
| `data-id` | Pairs the start and end markers. |
| `data-color` | `yellow`, `green`, `blue`, `pink`, `purple` or `orange`. |
| `data-note` | The comment, on the end marker only. HTML-entity escaped, for example `&#10;` is a newline. |
| `data-author`, `data-time` | Author and creation time, `YYYY-MM-DD HH:mm` (optional). |
| `data-resolved="1"` | Marks a resolved annotation. Absent means unresolved. |
| `data-replies` | Optional JSON array of replies: `a` author, `t` time, `c` content. |

For a code block the two markers sit on their own lines just outside the fences. Inside a table they wrap the text within one cell.

### The hidden agent guide

At the end of every note that has annotations the plugin keeps an HTML comment (`<!-- ann-guide:start ... ann-guide:end -->`) that explains the rules above to an AI agent. It is written in Chinese, marked "do not delete or edit", invisible in reading view, hidden in live preview (switchable in the settings), refreshed when the plugin updates it, and removed again when the last annotation is deleted.

## Known limitations

- Without this plugin the markers are invisible empty `<span>` elements: your text is intact, but no highlights are shown.
- If an annotation's start or end falls inside Markdown syntax such as `**bold**`, rendering may be off.
- Overlapping annotations stack their colors in reading view.
- Table annotations must stay within one cell. Code block annotations always cover the entire block, never single lines. Fenced code blocks inside blockquotes are not recognized as code blocks.
- The plugin's interface is Chinese only for now.

## UI labels

| Label | Meaning |
|---|---|
| 添加批注 | Add annotation |
| 批注栏 / 批注 | Annotation sidebar |
| 答复 | Reply |
| 发送 | Send |
| 解决 / 取消解决 | Resolve / Unresolve |
| 已解决 | Resolved |
| 编辑 | Edit |
| 更改颜色 | Change color |
| 删除 | Delete |
| 保存 / 取消 | Save / Cancel |
| 黄色 / 绿色 / 蓝色 / 粉色 / 紫色 / 橙色 | Yellow / green / blue / pink / purple / orange |

## Development

```bash
npm install
npm run dev     # rebuild main.js on change
npm run build   # type-check and bundle main.js
npm test        # unit tests for the marker logic (src/core.ts)
```

Copy or symlink `main.js`, `manifest.json` and `styles.css` into a vault's `.obsidian/plugins/margin-annotations/` folder to try a build. Pushing a tag creates a GitHub release with those three files.

## License

[MIT](LICENSE)
