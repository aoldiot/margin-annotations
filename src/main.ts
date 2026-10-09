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
  findAnnotationAt,
  findAnnotationById,
  lineOffset,
  normalizeColor,
  parseAnnotations,
  rangeAtCursor,
  removeAnnotationChanges,
  updateAnnotationChanges,
  wrapSelection,
} from "./core";
import { MarginManager } from "./margin";
import { AnnotationSidebarView, VIEW_TYPE } from "./view";

interface Settings {
  defaultColor: string;
  author: string;
  follow: boolean;
}
const DEFAULT_SETTINGS: Settings = { defaultColor: DEFAULT_COLOR, author: "", follow: true };

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
    area.placeholder = "写下批注…(⌘/Ctrl + Enter 保存)";
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
    row.createSpan({ text: "颜色", cls: "ann-color-label" });
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
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("保存").setCta().onClick(() => this.submit()));

    window.setTimeout(() => {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }, 0);
  }

  private submit() {
    const note = this.note.trim();
    if (!note) {
      new Notice("批注内容不能为空");
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

    this.registerEditorExtension(annotationHighlighter);
    this.registerView(VIEW_TYPE, (leaf) => new AnnotationSidebarView(leaf, this));
    this.registerEditorExtension(
      EditorView.updateListener.of((u) => {
        if (u.selectionSet && !u.docChanged) this.margin.onCursor(u.view);
      }),
    );
    this.addSettingTab(new AnnotationSettingTab(this.app, this));
    this.addRibbonIcon("message-square", "批注栏", () => void this.toggleMargin());

    this.addCommand({
      id: "add-annotation",
      name: "添加批注",
      editorCallback: (editor, view) => this.addAnnotation(editor, view.file),
    });
    this.addCommand({
      id: "edit-annotation",
      name: "编辑光标处批注",
      editorCallback: (editor, view) => {
        const a = this.annotationAtCursor(editor);
        if (a && view.file) void this.editAnnotation(view.file, a.id);
      },
    });
    this.addCommand({
      id: "remove-annotation",
      name: "删除选中的批注",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file && view.getMode() === "source") {
          const a = findAnnotationAt(view.editor.getValue(), view.editor.posToOffset(view.editor.getCursor("from")));
          if (a) return void this.deleteAnnotation(view.file, a.id);
        }
        if (!this.margin.deleteSelected()) new Notice("请先选中一条批注(点击批注栏里的批注,或把光标放进批注文字)");
      },
    });
    this.addCommand({
      id: "toggle-margin",
      name: "打开/关闭批注栏",
      callback: () => void this.toggleMargin(),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const file = info.file;
        if (!file) return;
        menu.addItem((i) =>
          i.setTitle("添加批注").setIcon("message-square-plus").onClick(() => this.addAnnotation(editor, file)),
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

  onunload() {
    this.closePopover();
    this.margin.detach();
  }

  /** Current binding of the add-annotation command, as Obsidian prints it. */
  hotkeyText(): string {
    const hm = (this.app as unknown as { hotkeyManager?: { printHotkeyForCommand?(id: string): string } }).hotkeyManager;
    try {
      return hm?.printHotkeyForCommand?.(`${this.manifest.id}:add-annotation`) || "未设置";
    } catch {
      return "未设置";
    }
  }

  author(): string {
    return this.settings.author.trim() || "我";
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

  /** Apply `fn(doc)` changes through the open editor when there is one, else straight to the file. */
  async mutate(file: TFile, fn: (doc: string) => TextChange[] | null): Promise<boolean> {
    const v = this.findSourceView(file);
    if (v) {
      const changes = fn(v.editor.getValue());
      if (!changes?.length) return false;
      this.applyToEditor(v.editor, changes);
      return true;
    }
    let ok = false;
    await this.app.vault.process(file, (doc) => {
      const changes = fn(doc);
      if (!changes?.length) return doc;
      ok = true;
      return applyChanges(doc, changes);
    });
    return ok;
  }

  // --- operations ---------------------------------------------------------

  private annotationAtCursor(editor: Editor, notify = true): Annotation | null {
    const ann = findAnnotationAt(editor.getValue(), editor.posToOffset(editor.getCursor("from")));
    if (!ann && notify) new Notice("光标不在任何批注内");
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
      // Nothing selected: annotate the table cell / code block / line under the cursor.
      const r = rangeAtCursor(doc, from);
      if (!r) {
        new Notice("光标所在行没有可批注的文字");
        return;
      }
      ({ from, to } = r);
    }

    if (!wrapSelection(doc, from, to, "x", "test")) {
      new Notice("选区内没有可批注的文字(选区跨单元格或跨行的表格不支持)");
      return;
    }

    void this.margin.panelFor(editor).then((panel) => {
      if (panel) void panel.startDraft(from, to, doc.slice(from, to));
      else new Notice("请先切换到编辑模式,并选中要批注的文字");
    });
  }

  async editAnnotation(file: TFile, id: string) {
    const panel = this.margin.panelForFile(file.path);
    if (panel?.find(id)) {
      panel.startEdit(id);
      return;
    }
    const ann = findAnnotationById(await this.getDoc(file), id);
    if (!ann) return;
    new NoteModal(this.app, "编辑批注", ann.note, ann.color, (note, color) => {
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
      menu.addItem((i) => i.setTitle("答复批注").setIcon("message-square").onClick(() => panel.focusReply(id)));
    }
    menu.addItem((i) =>
      i
        .setTitle(resolved ? "取消解决" : "解决批注")
        .setIcon(resolved ? "rotate-ccw" : "check")
        .onClick(() => void this.updateAnnotation(file, id, (a) => ({ resolved: !a.resolved }))),
    );
    menu.addItem((i) => i.setTitle("编辑批注").setIcon("pencil").onClick(() => void this.editAnnotation(file, id)));
    menu.addItem((i) => {
      i.setTitle("更改批注颜色").setIcon("palette");
      const sub = (i as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
      if (sub) this.addColorItems(sub, (c) => void this.updateAnnotation(file, id, { color: c }));
      else i.onClick(() => this.showColorMenu(file, id));
    });
    menu.addItem((i) =>
      i.setTitle("删除批注").setIcon("trash").onClick(() => void this.deleteAnnotation(file, id)),
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
    marker.setAttribute("aria-label", "查看批注");
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
      const edit = actions.createEl("button", { text: "编辑" });
      edit.addEventListener("click", () => {
        this.closePopover();
        void this.editAnnotation(file, id);
      });
      const del = actions.createEl("button", { text: "删除" });
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
      new Notice("请手动打开「设置 → 快捷键」,搜索「批注」");
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
      text: "在 Markdown 原文里直接插入批注标记:选中文字,按快捷键写下批注。阅读模式只显示高亮和一个 💬 按钮,AI agent 直接读源文件即可看到全部批注。",
    });

    new Setting(containerEl)
      .setName("默认批注颜色")
      .setDesc("添加批注时对话框里预选的颜色,每条批注之后都可以单独更改。")
      .addDropdown((d) => {
        for (const c of COLORS) d.addOption(c.key, c.label);
        d.setValue(this.plugin.settings.defaultColor).onChange(async (v) => {
          this.plugin.settings.defaultColor = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("批注人名称")
      .setDesc("显示在批注和答复上,留空则显示「我」。")
      .addText((t) =>
        t.setValue(this.plugin.settings.author).onChange(async (v) => {
          this.plugin.settings.author = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("批注跟随正文")
      .setDesc("开启:批注卡片紧贴对应原文,随正文滚动(批注较多时可单独上下滚动批注栏)。关闭:批注栏按原文顺序列表显示,点击批注跳转到原文。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.follow).onChange(async (v) => {
          this.plugin.settings.follow = v;
          await this.plugin.saveSettings();
          this.plugin.margin.sync(true);
        }),
      );

    const hk = new Setting(containerEl)
      .setName("添加批注快捷键")
      .setDesc("快捷键由 Obsidian 统一管理。点击按钮跳转到「快捷键」设置并搜索本插件的命令(添加批注、删除选中的批注、打开/关闭批注栏)。");
    hk.controlEl.createSpan({ cls: "ann-hotkey-label", text: this.plugin.hotkeyText() });
    hk.addButton((b) => b.setButtonText("设置快捷键").onClick(() => this.openHotkeySettings()));

    new Setting(containerEl).setName("使用方法").setHeading();
    const ul = containerEl.createEl("ul");
    [
      "选中文字 → 按「添加批注」的快捷键(需先在「设置 → 快捷键」里绑定)或右键「添加批注」→ 在右侧批注栏输入内容 → ⌘/Ctrl + Enter 保存。",
      "右键菜单:选中文字时有「添加批注」;光标在批注内时有「编辑 / 更改颜色 / 删除」;阅读模式下在高亮上右键同样可用。",
      "右侧批注栏的每条批注显示批注人和时间,可「答复」「解决 / 取消解决」「编辑」「改色」「删除」,并随正文滚动。批注栏在 Obsidian 右侧边栏里,左侧工具栏 💬 图标可打开 / 关闭。",
      "支持跨行、跨段落、跨列表批注。可在表格单元格内批注;选中代码块内容会批注整个代码块。",
      "源文件里批注是一对空的 <span> 标记(开头标记 + 结尾标记,批注内容写在结尾标记上),AI agent 读文件就能处理。",
    ].forEach((t) => ul.createEl("li", { text: t }));
  }
}
