import { Notice, Platform, SuggestModal, TFile, debounce } from "obsidian";
import type { App, TAbstractFile } from "obsidian";
import { parseAnnotations } from "./core";
import { fmt, t } from "./i18n";
import { CommentItem, byNewest, commentItems, excerpt, isUnread, sameAuthor } from "./unread";
import type InlineAnnotationsPlugin from "./main";

/** How long comment notices stay up; clicking one opens the comment and dismisses it sooner. */
const NOTICE_MS = 60_000;

// Unread comments from other annotators. Keeps an index of every comment in the vault, the set of comment keys
// this device has seen (stored in the plugin's data.json, so each device tracks its own), and announces comments
// that sync in while Obsidian is open. A comment counts as seen once its card has been shown in the margin.

export class Inbox {
  private index = new Map<string, CommentItem[]>();
  /** Unread keys already announced this session, so later edits of the same note don't announce them again. */
  private announced = new Set<string>();
  private ready = false;
  private statusEl: HTMLElement | null = null;
  private listeners = new Set<() => void>();
  private save = debounce(() => void this.plugin.saveSettings(), 1000, true);

  constructor(private plugin: InlineAnnotationsPlugin) {}

  private get seen(): Set<string> {
    return this.plugin.seen;
  }

  private me(): string {
    return this.plugin.author();
  }

  /** Index the whole vault once the layout is ready. The first run on a device marks everything seen. */
  async init() {
    const { vault } = this.plugin.app;
    for (const file of vault.getMarkdownFiles()) {
      const items = await this.read(file);
      if (items.length) this.index.set(file.path, items);
    }
    const all = this.allItems();
    if (!this.plugin.settings.unreadBaseline) {
      for (const i of all) this.seen.add(i.key);
      this.plugin.settings.unreadBaseline = true;
    } else {
      // Forget keys of comments that no longer exist, so the stored set doesn't grow forever.
      const live = new Set(all.map((i) => i.key));
      for (const k of [...this.seen]) if (!live.has(k)) this.seen.delete(k);
    }
    void this.plugin.saveSettings();

    this.ready = true;
    const unread = this.unread();
    unread.forEach((i) => this.announced.add(i.key));
    this.changed();
    // The margin may already show a note; let it pick up that note's unread comments now.
    this.plugin.margin.sync(true);
    if (unread.length && this.plugin.settings.notify) {
      const n = unread.length;
      const notice = new Notice(n === 1 ? t.unreadOnOpenOne : fmt(t.unreadOnOpenMany, { n }), NOTICE_MS);
      notice.messageEl.addClass("ann-notice-click");
      notice.messageEl.addEventListener("click", () => this.openList());
    }
  }

  private async read(file: TFile): Promise<CommentItem[]> {
    const doc = await this.plugin.app.vault.cachedRead(file);
    return doc.includes('class="ann-') ? commentItems(file.path, parseAnnotations(doc)) : [];
  }

  async onModify(file: TAbstractFile) {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const items = await this.read(file);
    const before = new Set((this.index.get(file.path) ?? []).map((i) => i.key));
    if (items.length) this.index.set(file.path, items);
    else this.index.delete(file.path);
    if (!this.ready) return;
    // Announce comments that weren't in this note before, by anyone else. Not "unread": when the note is open
    // with the margin showing, the margin may already have marked the comment seen, and it still gets a pop-up.
    const me = this.me();
    const fresh = items.filter((i) => !before.has(i.key) && !this.announced.has(i.key) && !sameAuthor(i.author, me));
    fresh.forEach((i) => this.announced.add(i.key));
    if (fresh.length) this.announce(fresh);
    this.changed();
  }

  onRename(file: TAbstractFile, oldPath: string) {
    const items = this.index.get(oldPath);
    if (!items) return;
    this.index.delete(oldPath);
    this.index.set(
      file.path,
      items.map((i) => ({ ...i, path: file.path })),
    );
    this.changed();
  }

  onDelete(file: TAbstractFile) {
    if (this.index.delete(file.path)) this.changed();
  }

  /** Nothing counts as unread before init(), which may first have to mark the existing comments seen. */
  isUnread(item: CommentItem): boolean {
    return this.ready && isUnread(item, this.me(), this.seen);
  }

  /** Write a pending seen-set save now (plugin unload). */
  flush() {
    this.save.run();
  }

  private allItems(): CommentItem[] {
    return [...this.index.values()].flat();
  }

  unread(exceptPath?: string): CommentItem[] {
    return this.allItems()
      .filter((i) => i.path !== exceptPath && this.isUnread(i))
      .sort(byNewest);
  }

  /** The margin showed these comments: remember them as seen. */
  markSeen(keys: Iterable<string>) {
    let added = false;
    for (const k of keys) {
      if (!this.seen.has(k)) {
        this.seen.add(k);
        added = true;
      }
    }
    if (!added) return;
    this.save();
    this.changed();
  }

  markAllRead() {
    this.markSeen(this.unread().map((i) => i.key));
    new Notice(t.markedAllRead);
  }

  /** Called with nothing whenever the unread set may have changed. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.updateStatus();
    this.listeners.forEach((fn) => fn());
  }

  /** Desktop status bar counter; mobile has no status bar and relies on the margin pill and notices. */
  attachStatusBar(el: HTMLElement) {
    this.statusEl = el;
    el.addClass("ann-status", "mod-clickable");
    el.addEventListener("click", () => this.openList());
    this.updateStatus();
  }

  private updateStatus() {
    const el = this.statusEl;
    if (!el) return;
    const n = this.ready ? this.unread().length : 0;
    el.toggle(n > 0);
    el.setText(`💬 ${n}`);
    el.setAttribute("aria-label", n === 1 ? t.unreadOnOpenOne : fmt(t.unreadOnOpenMany, { n }));
  }

  private announce(items: CommentItem[]) {
    if (!this.plugin.settings.notify) return;
    items.sort(byNewest);
    const first = items[0];
    const note = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");
    const title =
      items.length === 1
        ? fmt(first.reply < 0 ? t.newCommentFrom : t.newReplyFrom, { author: first.author || t.authorFallback, note: note(first.path) })
        : fmt(t.newCommentsMany, { n: items.length });
    const body = items.length === 1 ? excerpt(first.text) : items.map((i) => `${i.author}: ${excerpt(i.text, 60)}`).join("\n");
    const open = () => (items.length === 1 ? void this.plugin.openComment(first) : this.openList());

    // A system notification only helps when Obsidian isn't in front; otherwise an in-app notice is enough.
    if (Platform.isDesktopApp && !document.hasFocus() && typeof Notification !== "undefined" && Notification.permission !== "denied") {
      const n = new Notification(title, { body });
      n.onclick = () => {
        window.focus();
        open();
      };
      return;
    }
    const frag = createFragment((f) => {
      f.createEl("strong", { text: title });
      f.createDiv({ text: body, cls: "ann-notice-body" });
    });
    const notice = new Notice(frag, NOTICE_MS);
    notice.messageEl.addClass("ann-notice-click");
    notice.messageEl.addEventListener("click", open);
  }

  openList() {
    new UnreadModal(this.plugin.app, this.plugin, this.unread()).open();
  }
}

class UnreadModal extends SuggestModal<CommentItem> {
  constructor(
    app: App,
    private plugin: InlineAnnotationsPlugin,
    private items: CommentItem[],
  ) {
    super(app);
    this.setPlaceholder(t.unreadPlaceholder);
    this.emptyStateText = t.noUnread;
  }

  onOpen() {
    super.onOpen();
    if (!this.items.length) return;
    // A "Mark all read" button under the list; SuggestModal has no footer of its own.
    const btn = this.modalEl.createEl("button", { text: t.markAllRead, cls: "ann-unread-markall" });
    btn.addEventListener("click", () => {
      this.plugin.inbox.markAllRead();
      this.close();
    });
  }

  getSuggestions(query: string): CommentItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.items;
    return this.items.filter((i) => `${i.author} ${i.path} ${i.text}`.toLowerCase().includes(q));
  }

  renderSuggestion(item: CommentItem, el: HTMLElement) {
    el.addClass("ann-unread-item");
    const head = el.createDiv({ cls: "ann-unread-head" });
    head.createSpan({ cls: "ann-author", text: item.author || t.authorFallback });
    head.createSpan({ cls: "ann-unread-note", text: item.path.replace(/\.md$/, "") });
    if (item.time) head.createSpan({ cls: "ann-time", text: item.time });
    el.createDiv({ cls: "ann-unread-text", text: excerpt(item.text, 140) });
  }

  onChooseSuggestion(item: CommentItem) {
    void this.plugin.openComment(item);
  }
}
