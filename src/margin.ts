import { MarkdownView, Menu, Notice, TFile, setIcon } from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
  Annotation,
  COLORS,
  colorCss,
  excerptOf,
  existingIds,
  newId,
  nowStamp,
  parseAnnotations,
  wrapSelection,
} from "./core";
import type InlineAnnotationsPlugin from "./main";

// WPS-style comment margin: one panel per Markdown view, cards sit next to the text they annotate
// and move with the document when it scrolls.

const GAP = 8;

interface Draft {
  from: number;
  to: number;
  text: string;
  color: string;
}

export class MarginPanel {
  anns: Annotation[] = [];
  private el: HTMLElement;
  private track!: HTMLElement;
  private doc = "";
  private filePath = "";
  private mode = "";
  private seq = 0;
  private raf = 0;
  private activeId: string | null = null;
  private editingId: string | null = null;
  private draft: Draft | null = null;
  private draftEl: HTMLElement | null = null;
  private draftCleanup: (() => void) | null = null;
  private cards = new Map<string, HTMLElement>();
  private ro: ResizeObserver;
  view: MarkdownView | null = null;
  private onScroll = () => this.schedule();
  private onClick = (e: MouseEvent) => {
    const hl = (e.target as HTMLElement | null)?.closest?.(".ann-hl, .ann-btn") as HTMLElement | null;
    if (hl?.dataset.id) this.setActive(hl.dataset.id);
  };

  constructor(
    private plugin: InlineAnnotationsPlugin,
    host: HTMLElement,
  ) {
    this.el = host.createDiv({ cls: "ann-margin" });
    this.track = this.el.createDiv({ cls: "ann-track" });
    this.ro = new ResizeObserver(() => this.schedule());
    this.ro.observe(this.el);
    // Follow mode: scrolling the panel scrolls the note; the panel itself only scrolls once the note hits its end.
    this.el.addEventListener(
      "wheel",
      (e) => {
        const scroller = this.contentScroller();
        if (!this.follow || !scroller || e.ctrlKey) return;
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        if (dy > 0 && atEnd && this.el.scrollTop + this.el.clientHeight < this.el.scrollHeight) return;
        if (dy < 0 && this.el.scrollTop > 0) return;
        e.preventDefault();
        scroller.scrollTop += dy;
      },
      { passive: false },
    );
    // Clicking anywhere in the panel that is not a card clears the selection.
    this.el.tabIndex = -1;
    this.el.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches("input, textarea") || (e.key !== "Delete" && e.key !== "Backspace")) return;
      if (this.deleteActive()) e.preventDefault();
    });
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".ann-card")) this.setActive(null);
      // Keep keyboard focus in the panel so Delete works on the selected card.
      if (!t.closest("input, textarea, button")) this.el.focus({ preventScroll: true });
    });
  }

  private contentScroller(): HTMLElement | null {
    const view = this.view;
    if (!view) return null;
    if (view.getMode() === "source") return (view.editor as unknown as { cm?: EditorView }).cm?.scrollDOM ?? null;
    return view.contentEl.querySelector<HTMLElement>(".markdown-preview-view");
  }

  private get follow() {
    return this.plugin.settings.follow;
  }

  /** Follow another Markdown view (its scrolling drives the card positions). */
  bind(view: MarkdownView | null) {
    if (this.view === view) return;
    this.unlisten();
    this.view = view;
    this.mode = "";
    if (view) {
      view.contentEl.addEventListener("scroll", this.onScroll, true);
      view.contentEl.addEventListener("click", this.onClick, true);
      this.ro.observe(view.contentEl);
    }
    void this.refresh(true);
  }

  private unlisten() {
    const root = this.view?.contentEl;
    if (!root) return;
    root.removeEventListener("scroll", this.onScroll, true);
    root.removeEventListener("click", this.onClick, true);
    this.ro.unobserve(root);
  }

  destroy() {
    this.draftCleanup?.();
    this.unlisten();
    this.ro.disconnect();
    window.cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  // --- state --------------------------------------------------------------

  find(id: string): Annotation | undefined {
    return this.anns.find((a) => a.id === id);
  }

  private isBusy(): boolean {
    if (this.draft || this.editingId) return true;
    const ae = document.activeElement as HTMLElement | null;
    return !!ae && this.el.contains(ae) && (ae as HTMLTextAreaElement).value !== undefined && (ae as HTMLTextAreaElement).value !== "";
  }

  async refresh(force = false) {
    const file = this.view?.file;
    const seq = ++this.seq;
    if (!this.view || !file) {
      this.filePath = "";
      this.anns = [];
      this.cards.clear();
      this.draft = null;
      this.el.empty();
      this.track = this.el.createDiv({ cls: "ann-track" });
      this.track.createDiv({ cls: "ann-empty", text: "请先打开一篇 Markdown 笔记。" });
      return;
    }
    if (file.path !== this.filePath) {
      this.filePath = file.path;
      this.draft = null;
      this.editingId = null;
      this.activeId = null;
      force = true;
    }
    const doc = await this.plugin.getDoc(file);
    if (seq !== this.seq) return;
    this.mode = this.view.getMode();
    this.doc = doc;
    this.anns = parseAnnotations(doc);
    if (!force && this.isBusy()) {
      this.schedule();
      return;
    }
    this.render(file);
  }

  /** Called periodically: catches source/reading mode switches and lazily rendered reading-mode sections. */
  tick() {
    if (this.view && this.view.getMode() !== this.mode) void this.refresh(true);
    else this.schedule();
  }

  activeAnnotation(): Annotation | undefined {
    return this.activeId ? this.find(this.activeId) : undefined;
  }

  /** Delete the selected annotation; false when nothing is selected. */
  deleteActive(): boolean {
    const a = this.activeAnnotation();
    const file = this.view?.file;
    if (!a || !file) return false;
    this.activeId = null;
    void this.plugin.deleteAnnotation(file, a.id).then(() => this.refresh(true));
    return true;
  }

  setActive(id: string | null) {
    if (this.activeId === id) return;
    this.activeId = id;
    this.cards.forEach((c, cid) => c.toggleClass("is-active", cid === id));
    if (id && !this.follow) this.cards.get(id)?.scrollIntoView({ block: "nearest" });
    this.schedule();
  }

  /** Cursor moved in the editor: activate the innermost annotation under it. */
  onCursor(offset: number) {
    let best: Annotation | null = null;
    for (const a of this.anns) {
      if (offset >= a.from && offset <= a.to && (!best || a.to - a.from < best.to - best.from)) best = a;
    }
    if (!this.draft) this.setActive(best?.id ?? null);
  }

  // --- draft (new annotation) ----------------------------------------------

  async startDraft(from: number, to: number, text: string) {
    this.draft = { from, to, text, color: this.plugin.settings.defaultColor };
    this.activeId = null;
    this.editingId = null;
    await this.refresh(true);
    this.draftEl?.querySelector("textarea")?.focus();
  }

  private cancelDraft() {
    this.draft = null;
    void this.refresh(true);
  }

  private async commitDraft(note: string) {
    const d = this.draft;
    const file = this.view?.file;
    if (!d || !file || !this.view) return;
    const text = note.trim();
    if (!text) {
      new Notice("批注内容不能为空");
      return;
    }
    const editor = this.view.editor;
    const doc = editor.getValue();
    let { from, to } = d;
    if (doc.slice(from, to) !== d.text) {
      const idx = doc.indexOf(d.text);
      if (idx < 0) {
        new Notice("原文已被修改,请重新选择文字后再添加批注");
        return;
      }
      from = idx;
      to = idx + d.text.length;
    }
    const id = newId(existingIds(doc));
    const changes = wrapSelection(doc, from, to, text, id, d.color, {
      author: this.plugin.author(),
      time: nowStamp(),
    });
    if (!changes) {
      new Notice("选区内没有可批注的文字(选区跨单元格或跨行的表格不支持)");
      return;
    }
    this.draft = null;
    this.draftCleanup?.();
    this.draftCleanup = null;
    this.activeId = id;
    this.plugin.applyToEditor(editor, changes);
    await this.refresh(true);
  }

  startEdit(id: string) {
    this.editingId = id;
    this.activeId = id;
    void this.refresh(true).then(() => this.cards.get(id)?.querySelector("textarea")?.focus());
  }

  focusReply(id: string) {
    this.setActive(id);
    window.setTimeout(() => this.cards.get(id)?.querySelector<HTMLElement>(".ann-reply-input")?.focus(), 30);
  }

  // --- rendering ------------------------------------------------------------

  private render(file: TFile) {
    this.draftCleanup?.();
    this.draftCleanup = null;
    this.el.empty();
    this.track = this.el.createDiv({ cls: "ann-track" });
    this.el.toggleClass("ann-follow", this.follow);
    this.cards.clear();
    this.draftEl = null;
    if (this.draft) this.draftEl = this.renderDraft(this.draft);
    for (const a of this.anns) this.cards.set(a.id, this.renderCard(file, a));
    if (!this.draft && this.anns.length === 0) {
      this.track.createDiv({ cls: "ann-empty", text: "这篇笔记还没有批注。选中文字后右键「添加批注」。" });
    }
    this.schedule();
  }

  private renderHead(card: HTMLElement, author: string, time: string, color: string) {
    const head = card.createDiv({ cls: "ann-card-head" });
    const av = head.createDiv({ cls: "ann-avatar", text: (author || "我").slice(0, 1) });
    av.setCssProps({ background: colorCss(color) });
    const meta = head.createDiv({ cls: "ann-card-meta" });
    const name = meta.createDiv({ cls: "ann-author" });
    name.createSpan({ text: author || "批注" });
    if (time) meta.createDiv({ cls: "ann-time", text: time });
    return { head, name };
  }

  private renderDraft(d: Draft): HTMLElement {
    const card = this.track.createDiv({ cls: "ann-card is-draft is-active" });
    card.setCssProps({ "--ann-card-color": colorCss(d.color) });
    this.renderHead(card, this.plugin.author(), nowStamp(), d.color);
    card.createDiv({ cls: "ann-card-quote", text: d.text.replace(/\s+/g, " ").trim().slice(0, 60) });

    const area = card.createEl("textarea", { cls: "ann-card-edit", attr: { placeholder: "写下批注…(⌘/Ctrl + Enter 保存)", rows: "3" } });
    const row = card.createDiv({ cls: "ann-color-row" });
    const swatches: HTMLElement[] = [];
    for (const c of COLORS) {
      const sw = row.createSpan({ cls: "ann-swatch" });
      sw.setCssProps({ "--ann-swatch": c.css });
      sw.setAttribute("aria-label", c.label);
      sw.toggleClass("is-selected", c.key === d.color);
      sw.addEventListener("click", () => {
        d.color = c.key;
        swatches.forEach((s) => s.removeClass("is-selected"));
        sw.addClass("is-selected");
        card.setCssProps({ "--ann-card-color": c.css });
      });
      swatches.push(sw);
    }
    const actions = card.createDiv({ cls: "ann-card-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const save = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    cancel.addEventListener("click", () => this.cancelDraft());
    // Clicking anywhere outside the card saves the draft as long as something was written.
    const onDown = (e: MouseEvent) => {
      if (card.contains(e.target as Node) || !area.value.trim()) return;
      void this.commitDraft(area.value);
    };
    document.addEventListener("mousedown", onDown, true);
    this.draftCleanup = () => document.removeEventListener("mousedown", onDown, true);
    save.addEventListener("click", () => void this.commitDraft(area.value));
    area.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save.click();
      } else if (e.key === "Escape") cancel.click();
    });
    return card;
  }

  private renderCard(file: TFile, a: Annotation): HTMLElement {
    const plugin = this.plugin;
    const card = this.track.createDiv({ cls: "ann-card" });
    card.toggleClass("is-resolved", a.resolved);
    card.toggleClass("is-active", a.id === this.activeId);
    card.dataset.id = a.id;
    card.setCssProps({ "--ann-card-color": colorCss(a.color) });
    card.addEventListener("click", () => {
      this.setActive(a.id);
      if (!this.follow) this.reveal(a);
    });

    // Annotations written before timestamps existed fall back to the note's last-modified time.
    const time = a.time || `约 ${nowStamp(new Date(file.stat.mtime))}`;
    const { head, name } = this.renderHead(card, a.author, time, a.color);
    if (a.resolved) name.createSpan({ cls: "ann-badge", text: "已解决" });
    const more = head.createEl("button", { cls: "ann-icon-btn ann-more", attr: { "aria-label": "更多" } });
    setIcon(more, "more-horizontal");
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setActive(a.id);
      this.showMenu(file, a, e);
    });

    const q = excerptOf(this.doc, a, 60);
    if (q) card.createDiv({ cls: "ann-card-quote", text: q });

    if (this.editingId === a.id) {
      const area = card.createEl("textarea", { cls: "ann-card-edit", attr: { rows: "3" } });
      area.value = a.note;
      const actions = card.createDiv({ cls: "ann-card-actions" });
      const cancel = actions.createEl("button", { text: "取消" });
      const save = actions.createEl("button", { text: "保存", cls: "mod-cta" });
      const finish = () => {
        this.editingId = null;
        void this.refresh(true);
      };
      cancel.addEventListener("click", finish);
      save.addEventListener("click", () => {
        const note = area.value.trim();
        void (async () => {
          if (note) await plugin.updateAnnotation(file, a.id, { note });
          finish();
        })();
      });
      area.addEventListener("keydown", (e) => {
        if (e.isComposing) return;
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save.click();
        else if (e.key === "Escape") cancel.click();
      });
    } else {
      card.createDiv({ cls: "ann-card-note", text: a.note });
    }

    if (a.replies.length) {
      const list = card.createDiv({ cls: "ann-replies" });
      a.replies.forEach((r, i) => {
        const item = list.createDiv({ cls: "ann-reply" });
        const top = item.createDiv({ cls: "ann-reply-head" });
        top.createSpan({ cls: "ann-author", text: r.author || "回复" });
        top.createSpan({ cls: "ann-time", text: r.time || `约 ${nowStamp(new Date(file.stat.mtime))}` });
        const del = top.createEl("button", { cls: "ann-icon-btn ann-reply-del", attr: { "aria-label": "删除答复" } });
        setIcon(del, "x");
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          void plugin
            .updateAnnotation(file, a.id, (cur) => ({ replies: cur.replies.filter((_, j) => j !== i) }))
            .then(() => this.refresh(true));
        });
        item.createDiv({ cls: "ann-reply-text", text: r.text });
      });
    }

    const box = card.createDiv({ cls: "ann-reply-box" });
    const input = box.createEl("textarea", { cls: "ann-reply-input", attr: { placeholder: "答复…", rows: "1" } });
    const send = box.createEl("button", { text: "发送", cls: "mod-cta" });
    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await plugin.updateAnnotation(file, a.id, (cur) => ({
        replies: [...cur.replies, { author: plugin.author(), time: nowStamp(), text }],
      }));
      void this.refresh(true);
    };
    send.addEventListener("click", (e) => {
      e.stopPropagation();
      void submit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      } else if (e.key === "Escape") input.blur();
    });
    return card;
  }

  private showMenu(file: TFile, a: Annotation, e: MouseEvent) {
    const plugin = this.plugin;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("答复").setIcon("message-square").onClick(() => this.focusReply(a.id)));
    menu.addItem((i) =>
      i
        .setTitle(a.resolved ? "取消解决" : "解决")
        .setIcon(a.resolved ? "rotate-ccw" : "check")
        .onClick(async () => {
          await plugin.updateAnnotation(file, a.id, (cur) => ({ resolved: !cur.resolved }));
          void this.refresh(true);
        }),
    );
    menu.addItem((i) => i.setTitle("编辑").setIcon("pencil").onClick(() => this.startEdit(a.id)));
    menu.addItem((i) => {
      i.setTitle("更改颜色").setIcon("palette");
      const sub = (i as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
      if (sub) plugin.addColorItems(sub, (c) => void plugin.updateAnnotation(file, a.id, { color: c }), a.color);
    });
    menu.addItem((i) =>
      i
        .setTitle("删除")
        .setIcon("trash")
        .onClick(async () => {
          await plugin.deleteAnnotation(file, a.id);
          void this.refresh(true);
        }),
    );
    menu.showAtMouseEvent(e);
  }

  /** List mode: bring the annotated text into view. */
  private reveal(a: Annotation) {
    const view = this.view;
    if (!view) return;
    if (view.getMode() === "source") {
      const from = view.editor.offsetToPos(a.textFrom);
      const to = view.editor.offsetToPos(a.textTo);
      view.editor.scrollIntoView({ from, to }, true);
    } else {
      const line = this.doc.slice(0, a.textFrom).split("\n").length - 1;
      view.setEphemeralState({ line });
    }
  }

  // --- positioning ------------------------------------------------------------

  schedule() {
    if (this.raf) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = 0;
      this.layout();
    });
  }

  /** Vertical position (relative to the panel top) of the document offset, or null when unknown. */
  private anchorY(offset: number, id: string | null, panelTop: number): number | null {
    const view = this.view;
    if (!view) return null;
    if (view.getMode() === "source") {
      const cm = (view.editor as unknown as { cm?: EditorView }).cm;
      if (!cm) return null;
      let y: number | undefined;
      try {
        const c = cm.coordsAtPos(offset);
        if (c) y = c.top;
      } catch {
        /* position not rendered */
      }
      if (y === undefined) {
        try {
          y = cm.documentTop + cm.lineBlockAt(offset).top;
        } catch {
          return null;
        }
      }
      return y - panelTop;
    }
    if (!id) return null;
    const reading = view.contentEl.querySelector(".markdown-reading-view");
    const sel = `[data-id="${CSS.escape(id)}"]`;
    const target = reading?.querySelector(`.ann-hl${sel}`) ?? reading?.querySelector(`.ann-btn${sel}`);
    return target ? target.getBoundingClientRect().top - panelTop : null;
  }

  private layout() {
    if (!this.view) return;
    if (!this.follow) {
      // List mode: the stylesheet ignores --ann-y / --ann-track-h, cards simply flow.
      this.cards.forEach((c) => c.removeClass("is-hidden"));
      return;
    }
    const panelTop = this.el.getBoundingClientRect().top;
    type Entry = { el: HTMLElement; anchor: number; h: number; active: boolean; top: number };
    const entries: Entry[] = [];
    const hide = (el: HTMLElement) => el.addClass("is-hidden");

    const place = (el: HTMLElement, anchor: number | null, active: boolean) => {
      if (anchor === null) return hide(el);
      el.removeClass("is-hidden");
      entries.push({ el, anchor, h: el.offsetHeight, active, top: anchor });
    };

    if (this.draftEl && this.draft) place(this.draftEl, this.anchorY(this.draft.from, null, panelTop) ?? 0, true);
    const byId = new Map(this.anns.map((a) => [a.id, a]));
    this.cards.forEach((el, id) => {
      const a = byId.get(id);
      if (!a) return hide(el);
      place(el, this.anchorY(a.textFrom, id, panelTop), id === this.activeId);
    });

    entries.sort((x, y) => x.anchor - y.anchor);
    const act = entries.findIndex((e) => e.active);
    for (let i = 0; i < entries.length; i++) {
      if (i === act) continue;
      if (act >= 0 && i < act) continue;
      const prev = entries[i - 1];
      entries[i].top = prev ? Math.max(entries[i].anchor, prev.top + prev.h + GAP) : entries[i].anchor;
    }
    if (act >= 0) {
      for (let i = act - 1; i >= 0; i--) {
        entries[i].top = Math.min(entries[i].anchor, entries[i + 1].top - entries[i].h - GAP);
      }
      for (let i = act + 1; i < entries.length; i++) {
        const prev = entries[i - 1];
        entries[i].top = Math.max(entries[i].anchor, prev.top + prev.h + GAP);
      }
    }
    let bottom = 0;
    for (const e of entries) {
      e.el.setCssProps({ "--ann-y": `${Math.round(e.top)}px` });
      bottom = Math.max(bottom, e.top + e.h);
    }
    this.track.setCssProps({ "--ann-track-h": `${Math.ceil(bottom) + 24}px` });

    this.syncReadingHighlights();
  }

  /** Reading mode: dim resolved highlights, emphasise the active one. */
  private syncReadingHighlights() {
    if (!this.view || this.view.getMode() === "source") return;
    const reading = this.view.contentEl.querySelector(".markdown-reading-view");
    if (!reading) return;
    for (const a of this.anns) {
      const els = reading.querySelectorAll(`.ann-hl[data-id="${CSS.escape(a.id)}"]`);
      els.forEach((h) => {
        h.toggleClass("is-resolved", a.resolved);
        h.toggleClass("is-active", a.id === this.activeId);
      });
    }
  }
}

export class MarginManager {
  private panel: MarginPanel | null = null;

  constructor(private plugin: InlineAnnotationsPlugin) {}

  attach(host: HTMLElement) {
    this.panel?.destroy();
    this.panel = new MarginPanel(this.plugin, host);
    this.sync(true);
  }

  detach() {
    this.panel?.destroy();
    this.panel = null;
  }

  private markdownViews(): MarkdownView[] {
    const out: MarkdownView[] = [];
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) out.push(leaf.view);
    }
    return out;
  }

  /** Bind the sidebar to the active note (keeps the last one while the sidebar itself has focus). */
  sync(force = false) {
    const p = this.panel;
    if (!p) return;
    const views = this.markdownViews();
    const active = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    let target: MarkdownView | null = active && views.includes(active) ? active : null;
    if (!target && p.view && views.includes(p.view)) target = p.view;
    if (!target) target = views[0] ?? null;
    if (target !== p.view) p.bind(target);
    else void p.refresh(force);
  }

  /** Make sure the sidebar is open and following the view that owns `editor`. */
  async panelFor(editor: unknown): Promise<MarginPanel | null> {
    const view = this.markdownViews().find((v) => v.editor === editor);
    if (!view) return null;
    await this.plugin.activateView(true);
    this.panel?.bind(view);
    return this.panel;
  }

  refreshFile(path: string) {
    if (this.panel?.view?.file?.path === path) void this.panel.refresh();
  }

  tick() {
    this.panel?.tick();
  }

  /** Delete the annotation under the editor cursor, else the one selected in the sidebar. */
  deleteSelected(): boolean {
    const p = this.panel;
    return !!p && p.deleteActive();
  }

  panelForFile(path: string): MarginPanel | null {
    return this.panel?.view?.file?.path === path ? this.panel : null;
  }

  onCursor(cm: EditorView) {
    const v = this.panel?.view;
    if (v && (v.editor as unknown as { cm?: EditorView }).cm === cm) this.panel!.onCursor(cm.state.selection.main.head);
  }
}
