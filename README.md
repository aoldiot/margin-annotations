# Margin Annotations

**English** | [简体中文](README.zh-CN.md)

Word-style annotations for Obsidian. Select text, write a comment in the sidebar, reply to it, resolve it or delete it. Each annotation and reply carries a timestamp.

Annotations are stored as a pair of `<span>` markers directly in the Markdown source, so AI agents (Claude Code and similar) can read and act on them straight from the file. No export or API is needed.

> **Note:** adding, editing or deleting an annotation modifies the note's source text (it inserts or removes the `<span>` markers). The plugin's interface is currently in Chinese; this README is in English first, with a Chinese version below.

## Features

- Annotate any selection, including across lines, paragraphs, list items and headings.
- Six highlight colors (yellow, green, blue, pink, purple, orange), changeable per annotation.
- **Sidebar in Obsidian's right dock** with one card per annotation:
  - write the comment in the sidebar right after selecting text;
  - cards sit next to the text they annotate and scroll with the note (can be switched off for a plain list);
  - scroll the sidebar to scroll the note;
  - reply, resolve / unresolve, edit, change color, delete;
  - author name and timestamp on every annotation and reply.
- A draft annotation is saved automatically when you click anywhere else, as long as it has text.
- Click empty space in the sidebar to deselect; press `Delete` / `Backspace` to delete the selected annotation.
- Reading view shows highlights and a small 💬 button; right-click works on highlights too.
- Code blocks, tables and horizontal rules are skipped automatically.

## Installation

**From the Community Plugins browser** (once the plugin is published)

1. Open **Settings → Community plugins → Browse**.
2. Search for "Margin Annotations", then select **Install** and **Enable**.

**Manual installation**

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/aoldiot/margin-annotations/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/margin-annotations/`.
3. Reload Obsidian and enable **Margin Annotations** under **Settings → Community plugins**.

## Usage

1. Open a note in editing mode (source or live preview) and select some text.
2. Run the command **Add annotation** (or right-click → **Add annotation**). Assign a hotkey under **Settings → Hotkeys** by searching for "Add annotation".
3. Write your comment in the sidebar card and press `Cmd/Ctrl + Enter`, or just click elsewhere. The card is saved.
4. Use the **⋯** menu on a card to reply, resolve, edit, recolor or delete. Click a card to select it; a reply box appears at the bottom.
5. Open or close the sidebar with the ribbon icon or the command **Open/close annotation sidebar**.

| Action | How |
|---|---|
| Add | Select text, run **Add annotation**, type in the sidebar |
| Reply | Click a card, type in the reply box, press `Enter` |
| Resolve / unresolve | **⋯** menu on the card, or the right-click menu |
| Delete | **⋯** menu, `Delete` key on a selected card, or the command **Delete selected annotation** |
| Toggle follow mode | **Settings → Margin Annotations → follow note** (off = plain list) |
| Author name | **Settings → Margin Annotations** |

Annotations cannot be created in reading view, because reading view cannot be reliably mapped back to the source. Switch to editing mode to add them.

## File format (for AI agents)

One annotation is a start marker, the annotated text and an end marker. The comment lives on the end marker's `data-note` attribute:

```html
<span class="ann-s" data-id="k3f9" data-color="yellow"></span>Annotated text, possibly spanning several paragraphs.
Last line.<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="Too formal, make it conversational" data-author="sky" data-time="2026-10-09 13:36" data-resolved="1" data-replies="[{&#34;a&#34;:&#34;sky&#34;,&#34;t&#34;:&#34;2026-10-09 13:37&#34;,&#34;c&#34;:&#34;Done&#34;}]"></span>
```

- `data-id` pairs the start and end markers.
- `data-color` is one of `yellow`, `green`, `blue`, `pink`, `purple`, `orange`.
- `data-author` / `data-time` (optional) are the author and creation time.
- `data-resolved="1"` marks a resolved annotation.
- `data-replies` (optional) is a JSON array: `a` author, `t` time, `c` content.
- `data-note` is the comment, HTML-entity escaped (for example `&#10;` is a newline).

Example prompt for an agent:

```
Read every <span class="ann-e" ... data-note="..."> annotation in xxx.md.
The text an annotation refers to lies between the ann-s and ann-e markers with the same data-id.
Skip annotations with data-resolved="1". Revise the text according to each note (and its data-replies discussion),
then remove both markers of the annotation. Do not touch text without annotations.
```

## Known limitations

- Without this plugin, the markers are invisible empty `<span>` elements: your text is intact, but no highlights are shown.
- If an annotation's start or end falls inside Markdown syntax such as `**bold**`, rendering may be off.
- Overlapping annotations stack their colors in reading view.
- Annotations cannot be placed inside table cells or code blocks.

## License

MIT
