import {
  App,
  Editor,
  MarkdownPostProcessorContext,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  debounce,
} from "obsidian";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import {
  Annotation,
  AnnotationPatch,
  COLORS,
  DEFAULT_COLOR,
  TextChange,
  applyChanges,
  blockAround,
  compactText,
  findAnnotationAt,
  findGuide,
  findAnnotationById,
  findRenderedText,
  lineOffset,
  normalizeColor,
  occurrencesBefore,
  parseAnnotations,
  rangeAtCursor,
  removeAnnotationChanges,
  updateAnnotationChanges,
  withGuide,
  wrapSelection,
} from "./core";
import { MarginManager } from "./margin";
import { AnnotationSidebarView, VIEW_TYPE } from "./view";

interface Settings {
  defaultColor: string;
  author: string;
  follow: boolean;
  hideMarkup: boolean;
}
const DEFAULT_SETTINGS: Settings = { defaultColor: DEFAULT_COLOR, author: "", follow: true, hideMarkup: true };

// ---------------------------------------------------------------------------
// Note + color dialog
// ---------------------------------------------------------------------------

class NoteModal extends Modal {
  private note: string;
  private color: string;

  constructor(
    app: App,
    private heading: string,
    initialNote: string,
    initialColor: string,
    private onSubmit: (note: string, color: string) => void,
  ) {
    super(app);
    this.note = initialNote;
    this.color = normalizeColor(initialColor);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.heading);

    const area = contentEl.createEl("textarea", { cls: "ann-modal-input" });
    area.placeholder = "Write a comment… (⌘/Ctrl + Enter to save)";
    area.rows = 5;
    area.value = this.note;
    area.addEventListener("input", () => (this.note = area.value));
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });

    const row = contentEl.createDiv({ cls: "ann-color-row" });
    row.createSpan({ text: "Color", cls: "ann-color-label" });
    const swatches: HTMLElement[] = [];
    for (const c of COLORS) {
      const sw = row.createSpan({ cls: "ann-swatch" });
      sw.setCssProps({ "--ann-swatch": c.css });
      sw.setAttribute("aria-label", c.label);
      sw.toggleClass("is-selected", c.key === this.color);
      sw.addEventListener("click", () => {
        this.color = c.key;
        swatches.forEach((s) => s.removeClass("is-selected"));
        sw.addClass("is-selected");
      });
      swatches.push(sw);
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()));

    window.setTimeout(() => {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }, 0);
  }

  private submit() {
    const note = this.note.trim();
    if (!note) {
      new Notice("The comment cannot be empty");
      return;
    }
    this.close();
    this.onSubmit(note, this.color);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Editor (source / live preview) decorations
// ---------------------------------------------------------------------------

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString();
  if (!doc.includes('class="ann-')) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  const guide = findGuide(doc);
  if (guide) {
    // line decorations let the stylesheet hide the agent guide in live preview
    const first = view.state.doc.lineAt(guide.from).number;
    const last = view.state.doc.lineAt(guide.to).number;
    for (let n = first; n <= last; n++) {
      ranges.push(Decoration.line({ class: "ann-guide-line" }).range(view.state.doc.line(n).from));
    }
  }
  for (const a of parseAnnotations(doc)) {
    ranges.push(Decoration.mark({ class: "ann-tag" }).range(a.startTag.from, a.startTag.to));
    if (a.textFrom < a.textTo) {
      ranges.push(Decoration.mark({ class: `ann-text ann-c-${a.color}${a.resolved ? " ann-resolved" : ""}` }).range(a.textFrom, a.textTo));
    }
    ranges.push(Decoration.mark({ class: "ann-tag" }).range(a.endTag.from, a.endTag.to));
  }
  return Decoration.set(ranges, true);
}

const annotationHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const INLINE_PARENTS = new Set(["P", "EM", "STRONG", "A", "B", "I", "DEL", "MARK", "SPAN", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

export default class InlineAnnotationsPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private popover: HTMLElement | null = null;
  private popoverCleanup: (() => void) | null = null;
  margin = new MarginManager(this);

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<Settings> | null) };
    this.settings.defaultColor = normalizeColor(this.settings.defaultColor);

    this.applyMarkupSetting();
    this.registerEditorExtension(annotationHighlighter);
    this.registerView(VIEW_TYPE, (leaf) => new AnnotationSidebarView(leaf, this));
    this.registerEditorExtension(
      EditorView.updateListener.of((u) => {
        if (u.selectionSet && !u.docChanged) this.margin.onCursor(u.view);
      }),
    );
    this.addSettingTab(new AnnotationSettingTab(this.app, this));
    this.addRibbonIcon("message-square", "Annotation margin", () => void this.toggleMargin());

    this.addCommand({
      id: "add-annotation",
      name: "Add annotation",
      editorCallback: (editor, view) => this.addAnnotation(editor, view.file),
    });
    this.addCommand({
      id: "edit-annotation",
      name: "Edit annotation at cursor",
      editorCallback: (editor, view) => {
        const a = this.annotationAtCursor(editor);
        if (a && view.file) void this.editAnnotation(view.file, a.id);
      },
    });
    this.addCommand({
      id: "remove-annotation",
      name: "Delete selected annotation",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file && view.getMode() === "source") {
          const a = findAnnotationAt(view.editor.getValue(), view.editor.posToOffset(view.editor.getCursor("from")));
          if (a) return void this.deleteAnnotation(view.file, a.id);
        }
        if (!this.margin.deleteSelected()) new Notice("Select an annotation first (click one in the margin, or put the cursor inside the annotation's text)");
      },
    });
    this.addCommand({
      id: "toggle-margin",
      name: "Open/close the annotation margin",
      callback: () => void this.toggleMargin(),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const file = info.file;
        if (!file) return;
        menu.addItem((i) =>
          i.setTitle("Add annotation").setIcon("message-square-plus").onClick(() => this.addAnnotation(editor, file)),
        );
        const ann = this.annotationAtCursor(editor, false);
        if (ann) this.fillAnnotationMenu(menu, file, ann.id);
      }),
    );

    this.registerMarkdownPostProcessor((el, ctx) => this.decorateReading(el, ctx));

    const debounced = debounce(() => this.margin.sync(), 250, true);
    this.registerEvent(this.app.workspace.on("layout-change", () => this.margin.sync()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.margin.sync()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.margin.sync()));
    this.registerEvent(this.app.workspace.on("editor-change", debounced));
    this.registerEvent(this.app.vault.on("modify", (f) => this.margin.refreshFile(f.path)));
    this.registerInterval(window.setInterval(() => this.margin.tick(), 1000));
    this.app.workspace.onLayoutReady(() => this.margin.sync(true));
  }

  /** Toggle the body class that hides annotation markers and the agent guide in live preview. */
  applyMarkupSetting() {
    document.body.toggleClass("ann-hide-markup", this.settings.hideMarkup);
  }

  onunload() {
    document.body.removeClass("ann-hide-markup");
    this.closePopover();
    this.margin.detach();
  }

  /** Current binding of the add-annotation command, as Obsidian prints it. */
  hotkeyText(): string {
    const hm = (this.app as unknown as { hotkeyManager?: { printHotkeyForCommand?(id: string): string } }).hotkeyManager;
    try {
      return hm?.printHotkeyForCommand?.(`${this.manifest.id}:add-annotation`) || "not set";
    } catch {
      return "not set";
    }
  }

  author(): string {
    return this.settings.author.trim() || "Me";
  }

  async toggleMargin() {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (open.length) open.forEach((l) => l.detach());
    else await this.activateView();
  }

  /** Open the annotation sidebar in the right dock (and bring it to the front). */
  async activateView(reveal = true) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) return;
      await right.setViewState({ type: VIEW_TYPE, active: false });
      leaf = right;
    }
    if (reveal) await workspace.revealLeaf(leaf);
    this.margin.sync(true);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // --- file access --------------------------------------------------------

  private findSourceView(file: TFile): MarkdownView | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file?.path === file.path && v.getMode() === "source") return v;
    }
    return null;
  }

  findAnyView(file: TFile): MarkdownView | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file?.path === file.path) return v;
    }
    return null;
  }

  async getDoc(file: TFile): Promise<string> {
    const v = this.findSourceView(file);
    return v ? v.editor.getValue() : await this.app.vault.cachedRead(file);
  }

  applyToEditor(editor: Editor, changes: TextChange[]) {
    editor.transaction({
      changes: changes.map((c) => ({
        from: editor.offsetToPos(c.from),
        to: editor.offsetToPos(c.to),
        text: c.insert,
      })),
    });
  }

  /**
   * Remember the scroll position of every view showing `file`; the returned function puts it back.
   * Editing the file re-renders reading views (and can nudge editors), which would otherwise jump to the top.
   */
  private captureScroll(file: TFile): () => void {
    const saved: [HTMLElement, number][] = [];
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (!(v instanceof MarkdownView) || v.file?.path !== file.path) continue;
      const el =
        v.getMode() === "source"
          ? (v.editor as unknown as { cm?: EditorView }).cm?.scrollDOM
          : v.contentEl.querySelector<HTMLElement>(".markdown-preview-view");
      if (el) saved.push([el, el.scrollTop]);
    }
    return () => {
      for (const delay of [0, 60, 200, 500]) {
        window.setTimeout(() => {
          for (const [el, top] of saved) if (Math.abs(el.scrollTop - top) > 2) el.scrollTop = top;
        }, delay);
      }
    };
  }

  /** Apply `fn(doc)` changes through the open editor when there is one, else straight to the file. */
  async mutate(file: TFile, fn: (doc: string) => TextChange[] | null): Promise<boolean> {
    const restoreScroll = this.captureScroll(file);
    const v = this.findSourceView(file);
    if (v) {
      const doc = v.editor.getValue();
      const changes = fn(doc);
      if (!changes?.length) return false;
      this.applyToEditor(v.editor, withGuide(doc, changes));
      restoreScroll();
      return true;
    }
    let ok = false;
    await this.app.vault.process(file, (doc) => {
      const changes = fn(doc);
      if (!changes?.length) return doc;
      ok = true;
      return applyChanges(doc, withGuide(doc, changes));
    });
    restoreScroll();
    return ok;
  }

  // --- operations ---------------------------------------------------------

  private annotationAtCursor(editor: Editor, notify = true): Annotation | null {
    const ann = findAnnotationAt(editor.getValue(), editor.posToOffset(editor.getCursor("from")));
    if (!ann && notify) new Notice("The cursor is not inside any annotation");
    return ann;
  }

  addAnnotation(editor: Editor, file: TFile | null) {
    if (!file) return;
    const doc = editor.getValue();
    const a = editor.posToOffset(editor.getCursor("from"));
    const b = editor.posToOffset(editor.getCursor("to"));
    let from = Math.min(a, b);
    let to = Math.max(a, b);
    if (!editor.somethingSelected()) {
      // Text selected inside a rendered block (e.g. a callout in live preview) exists only in the DOM.
      const rendered = this.renderedSelection(editor, doc);
      if (rendered === "unlocated") {
        new Notice("Could not locate the selected text; double-click into edit mode, then select the text");
        return;
      }
      // Otherwise nothing is selected: annotate the table cell / code block / line under the cursor.
      const r = rendered ?? rangeAtCursor(doc, from);
      if (!r) {
        new Notice("No annotatable text on the cursor's line");
        return;
      }
      ({ from, to } = r);
    }

    if (!wrapSelection(doc, from, to, "x", "test")) {
      new Notice("No annotatable text in the selection (selections spanning table cells or rows are not supported)");
      return;
    }

    void this.margin.panelFor(editor).then((panel) => {
      if (panel) void panel.startDraft(from, to, doc.slice(from, to));
      else new Notice("Switch to editing mode and select the text to annotate");
    });
  }

  /**
   * Live preview renders blocks the cursor is not in (callouts, ...) as widgets; text selected there is a DOM
   * selection only and the editor's own selection stays empty. Map it back to a source range:
   * null when the selection is not inside such a widget, "unlocated" when its text is not in the source.
   */
  private renderedSelection(editor: Editor, doc: string): { from: number; to: number } | "unlocated" | null {
    const cm = (editor as unknown as { cm?: EditorView }).cm;
    const sel = cm?.contentDOM.ownerDocument.getSelection();
    if (!cm || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const widget = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest<HTMLElement>(".cm-embed-block");
    if (!widget || !cm.contentDOM.contains(widget)) return null;

    const selected = range.toString();
    const target = compactText(selected);
    if (!target) return "unlocated";

    // which occurrence inside the widget was selected, in case the same text appears more than once
    const whole = widget.ownerDocument.createRange();
    whole.selectNodeContents(widget);
    const head = whole.cloneRange();
    head.setEnd(range.startContainer, range.startOffset);
    const nth = occurrencesBefore(compactText(whole.toString()), target, compactText(head.toString()).length);

    let start = -1;
    try {
      const r = widget.getBoundingClientRect();
      start = cm.posAtCoords({ x: r.left + 2, y: r.top + 2 }, false);
    } catch {
      /* widget not laid out */
    }
    if (start >= 0) {
      const block = blockAround(doc, start);
      const hits = findRenderedText(doc.slice(block.from, block.to), selected);
      const hit = hits[Math.min(nth, hits.length - 1)];
      if (hit) return { from: block.from + hit.from, to: block.from + hit.to };
    }
    // widget position unknown: accept only an unambiguous match in the whole note
    const all = findRenderedText(doc, selected);
    return all.length === 1 ? all[0] : "unlocated";
  }

  async editAnnotation(file: TFile, id: string) {
    const panel = this.margin.panelForFile(file.path);
    if (panel?.find(id)) {
      panel.startEdit(id);
      return;
    }
    const ann = findAnnotationById(await this.getDoc(file), id);
    if (!ann) return;
    new NoteModal(this.app, "Edit annotation", ann.note, ann.color, (note, color) => {
      void this.mutate(file, (doc) => {
        const a = findAnnotationById(doc, id);
        return a ? updateAnnotationChanges(a, { note, color }) : null;
      });
    }).open();
  }

  async updateAnnotation(file: TFile, id: string, patch: AnnotationPatch | ((a: Annotation) => AnnotationPatch)) {
    await this.mutate(file, (doc) => {
      const a = findAnnotationById(doc, id);
      return a ? updateAnnotationChanges(a, typeof patch === "function" ? patch(a) : patch) : null;
    });
  }

  async deleteAnnotation(file: TFile, id: string) {
    await this.mutate(file, (doc) => {
      const a = findAnnotationById(doc, id);
      return a ? removeAnnotationChanges(a) : null;
    });
  }

  // --- menus --------------------------------------------------------------

  addColorItems(menu: Menu, onPick: (color: string) => void, current?: string) {
    for (const c of COLORS) {
      menu.addItem((i) =>
        i
          .setTitle(c.label + (c.key === current ? "  ✓" : ""))
          .setIcon("circle")
          .onClick(() => onPick(c.key)),
      );
    }
  }

  fillAnnotationMenu(menu: Menu, file: TFile, id: string) {
    const panel = this.margin.panelForFile(file.path);
    const resolved = panel?.find(id)?.resolved ?? false;
    if (panel) {
      menu.addItem((i) => i.setTitle("Reply to annotation").setIcon("message-square").onClick(() => panel.focusReply(id)));
    }
    menu.addItem((i) =>
      i
        .setTitle(resolved ? "Unresolve" : "Resolve annotation")
        .setIcon(resolved ? "rotate-ccw" : "check")
        .onClick(() => void this.updateAnnotation(file, id, (a) => ({ resolved: !a.resolved }))),
    );
    menu.addItem((i) => i.setTitle("Edit annotation").setIcon("pencil").onClick(() => void this.editAnnotation(file, id)));
    menu.addItem((i) => {
      i.setTitle("Change annotation color").setIcon("palette");
      const sub = (i as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
      if (sub) this.addColorItems(sub, (c) => void this.updateAnnotation(file, id, { color: c }));
      else i.onClick(() => this.showColorMenu(file, id));
    });
    menu.addItem((i) =>
      i.setTitle("Delete annotation").setIcon("trash").onClick(() => void this.deleteAnnotation(file, id)),
    );
  }

  private showColorMenu(file: TFile, id: string, evt?: MouseEvent) {
    const m = new Menu();
    this.addColorItems(m, (c) => void this.updateAnnotation(file, id, { color: c }));
    if (evt) m.showAtMouseEvent(evt);
    else m.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
  }

  // --- reading mode -------------------------------------------------------

  private decorateReading(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const doc = el.ownerDocument;
    const abstract = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    const file = abstract instanceof TFile ? abstract : null;

    // Annotations already open when this section begins (multi-paragraph ranges).
    const open = new Map<string, string>();
    const info = ctx.getSectionInfo(el);
    if (info && info.text.includes('class="ann-')) {
      const start = lineOffset(info.text, info.lineStart);
      for (const a of parseAnnotations(info.text)) {
        if (a.startTag.to <= start && a.endTag.from >= start) open.set(a.id, a.color);
      }
    }

    const markers = el.querySelectorAll<HTMLElement>("span.ann-s, span.ann-e");
    if (open.size === 0 && markers.length === 0) return;

    // Fallback when section info is unavailable: an end marker without a start in this block means "open from the top".
    const seen = new Set<string>();
    markers.forEach((m) => {
      const id = m.dataset.id ?? "";
      if (m.classList.contains("ann-s")) seen.add(id);
      else if (!seen.has(id) && !open.has(id)) open.set(id, normalizeColor(m.dataset.color));
    });

    const nodes: Node[] = [];
    const walker = doc.createTreeWalker(el, 1 | 4); // elements + text
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const n of nodes) {
      if (n.nodeType === 1) {
        const e = n as HTMLElement;
        if (e.tagName !== "SPAN") continue;
        const id = e.dataset.id ?? "";
        if (e.classList.contains("ann-s")) {
          open.set(id, normalizeColor(e.dataset.color));
        } else if (e.classList.contains("ann-e")) {
          this.makeButton(e, file);
          open.delete(id);
        }
        continue;
      }
      if (open.size === 0) continue;
      const text = n as Text;
      const value = text.nodeValue ?? "";
      const parent = text.parentElement;
      if (!value || !parent || parent.closest(".ann-btn, .ann-popover")) continue;
      if (value.trim() === "" && !INLINE_PARENTS.has(parent.tagName)) continue;

      let current: Node = text;
      for (const [id, color] of open) {
        const span = parent.createSpan({ cls: "ann-hl" });
        span.dataset.id = id;
        span.dataset.color = color;
        if (file) {
          span.addEventListener("contextmenu", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const menu = new Menu();
            this.fillAnnotationMenu(menu, file, id);
            menu.showAtMouseEvent(evt);
          });
        }
        current.parentNode!.replaceChild(span, current);
        span.appendChild(current);
        current = span;
      }
    }
  }

  private makeButton(marker: HTMLElement, file: TFile | null) {
    const note = marker.dataset.note ?? "";
    marker.addClass("ann-btn");
    marker.setText("💬");
    marker.setAttribute("role", "button");
    marker.setAttribute("aria-label", "View annotation");
    marker.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.togglePopover(marker, note, file);
    });
    if (file) {
      marker.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const menu = new Menu();
        this.fillAnnotationMenu(menu, file, marker.dataset.id ?? "");
        menu.showAtMouseEvent(evt);
      });
    }
  }

  private togglePopover(anchor: HTMLElement, note: string, file: TFile | null) {
    const id = anchor.dataset.id ?? "";
    const wasOpen = this.popover?.dataset.annId === id;
    this.closePopover();
    if (wasOpen) return;

    const doc = anchor.ownerDocument;
    const win = doc.defaultView ?? window;
    const pop = doc.body.createDiv({ cls: "ann-popover" });
    pop.dataset.annId = id;
    pop.setCssProps({ "--ann-pop-color": COLORS.find((c) => c.key === normalizeColor(anchor.dataset.color))?.css ?? "" });
    pop.createDiv({ cls: "ann-popover-body", text: note });

    if (file) {
      const actions = pop.createDiv({ cls: "ann-popover-actions" });
      const edit = actions.createEl("button", { text: "Edit" });
      edit.addEventListener("click", () => {
        this.closePopover();
        void this.editAnnotation(file, id);
      });
      const del = actions.createEl("button", { text: "Delete" });
      del.addEventListener("click", () => {
        this.closePopover();
        void this.deleteAnnotation(file, id);
      });
    }

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(pop.offsetWidth || 320, win.innerWidth - 16);
    pop.setCssProps({
      left: `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`,
      top: `${rect.bottom + 6}px`,
    });

    const onDown = (e: Event) => {
      if (!pop.contains(e.target as Node) && e.target !== anchor) this.closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.closePopover();
    };
    const onScroll = (e: Event) => {
      if (!pop.contains(e.target as Node)) this.closePopover();
    };
    doc.addEventListener("mousedown", onDown, true);
    doc.addEventListener("keydown", onKey, true);
    doc.addEventListener("scroll", onScroll, true);
    this.popover = pop;
    this.popoverCleanup = () => {
      doc.removeEventListener("mousedown", onDown, true);
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("scroll", onScroll, true);
    };
  }

  private closePopover() {
    this.popoverCleanup?.();
    this.popoverCleanup = null;
    this.popover?.remove();
    this.popover = null;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

class AnnotationSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: InlineAnnotationsPlugin) {
    super(app, plugin);
  }

  /** Open Obsidian's Hotkeys tab filtered to this plugin. app.setting is not in the public typings, hence the guards. */
  private openHotkeySettings() {
    type Tab = { searchComponent?: { setValue(v: string): void; onChanged?(): void } };
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): Tab | undefined } }).setting;
    if (!setting) {
      new Notice("Open Settings → Hotkeys and search for \"annotation\" manually");
      return;
    }
    setting.open();
    const tab = setting.openTabById("hotkeys");
    tab?.searchComponent?.setValue(this.plugin.manifest.name);
    tab?.searchComponent?.onChanged?.();
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "Inserts annotation markers directly into the Markdown source: select text, press the hotkey, write the comment. Reading view shows only the highlight and a 💬 button; AI agents see every annotation by reading the source file.",
    });

    new Setting(containerEl)
      .setName("Default annotation color")
      .setDesc("Color preselected in the add-annotation dialog; each annotation can be changed individually afterwards.")
      .addDropdown((d) => {
        for (const c of COLORS) d.addOption(c.key, c.label);
        d.setValue(this.plugin.settings.defaultColor).onChange(async (v) => {
          this.plugin.settings.defaultColor = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Author name")
      .setDesc("Shown on annotations and replies; leave empty to show \"Me\".")
      .addText((t) =>
        t.setValue(this.plugin.settings.author).onChange(async (v) => {
          this.plugin.settings.author = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Margin follows the text")
      .setDesc("On: annotation cards sit beside the text they annotate and scroll with it (the margin can scroll on its own when there are many). Off: the margin lists annotations in note order; click one to jump to its text.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.follow).onChange(async (v) => {
          this.plugin.settings.follow = v;
          await this.plugin.saveSettings();
          this.plugin.margin.sync(true);
        }),
      );

    new Setting(containerEl)
      .setName("Hide annotation markers in live preview")
      .setDesc("Hides annotation markers and the AI agent guide in the note body (live preview only; source mode always shows the raw text).")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.hideMarkup).onChange(async (v) => {
          this.plugin.settings.hideMarkup = v;
          await this.plugin.saveSettings();
          this.plugin.applyMarkupSetting();
        }),
      );

    const hk = new Setting(containerEl)
      .setName("Add-annotation hotkey")
      .setDesc("Hotkeys are managed by Obsidian. The button opens the Hotkeys settings filtered to this plugin's commands (add annotation, delete selected annotation, open/close the margin).");
    hk.controlEl.createSpan({ cls: "ann-hotkey-label", text: this.plugin.hotkeyText() });
    hk.addButton((b) => b.setButtonText("Set hotkey").onClick(() => this.openHotkeySettings()));

    new Setting(containerEl).setName("How to use").setHeading();
    const ul = containerEl.createEl("ul");
    [
      "Select text → press the Add-annotation hotkey (bind it first under Settings → Hotkeys) or right-click → Add annotation → type the comment in the margin → ⌘/Ctrl + Enter to save.",
      "Context menu: Add annotation when text is selected; Edit / Change color / Delete when the cursor is inside an annotation; right-clicking a highlight works the same in reading view.",
      "Each annotation in the margin shows author and time, and supports reply, resolve / unresolve, edit, recolor, and delete; cards scroll with the text. The margin lives in Obsidian's right sidebar; the 💬 ribbon icon opens/closes it.",
      "Annotations can span lines, paragraphs, and lists. Table cells can be annotated; selecting inside a code block annotates the whole block.",
      "In the source file an annotation is a pair of empty <span> markers (start + end, comment on the end marker); AI agents can work with them by reading the file.",
    ].forEach((t) => ul.createEl("li", { text: t }));
  }
}
