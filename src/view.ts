import { ItemView, WorkspaceLeaf } from "obsidian";
import type InlineAnnotationsPlugin from "./main";

export const VIEW_TYPE = "inline-annotations-list";

/** Right-sidebar host for the annotation cards; the cards themselves are managed by MarginManager. */
export class AnnotationSidebarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: InlineAnnotationsPlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "批注";
  }
  getIcon() {
    return "message-square";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("ann-side-view");
    this.plugin.margin.attach(this.contentEl);
  }

  async onClose() {
    this.plugin.margin.detach();
  }
}
