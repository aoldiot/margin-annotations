// User-facing strings, kept in two dictionaries. The Chinese set is the
// plugin's original wording; the English set is the translation. The active
// set is chosen in onload() from the `language` setting, and defaults to
// following Obsidian's display language.
//
// NOTE: the hidden agent guide in core.ts is intentionally NOT localized.
// It is a machine-facing protocol written into notes; every device must agree
// on one canonical version of it.

const zh = {
    // Ribbons and commands
    ribbonMargin: "批注栏",
    addAnnotation: "添加批注",
    editAtCursor: "编辑光标处批注",
    deleteSelected: "删除选中的批注",
    toggleMargin: "打开/关闭批注栏",

    // Dialog
    colorLabel: "颜色",
    cancel: "取消",
    save: "保存",

    // Notices
    commentEmpty: "批注内容不能为空",
    selectAnnotationFirst: "请先选中一条批注(点击批注栏里的批注,或把光标放进批注文字)",
    notInsideAny: "光标不在任何批注内",
    couldNotLocate: "无法定位选中的文字,请双击进入编辑模式后再选中文字",
    noTextOnLine: "光标所在行没有可批注的文字",
    noTextInSelection: "选区内没有可批注的文字(选区跨单元格或跨行的表格不支持)",
    switchToEdit: "请先切换到编辑模式,并选中要批注的文字",
    textChanged: "原文已被修改,请重新选择文字后再添加批注",
    openHotkeyManually: "请手动打开「设置 → 快捷键」,搜索「批注」",

    // Menus and aria labels
    replyToAnnotation: "答复批注",
    editAnnotation: "编辑批注",
    resolveAnnotation: "解决批注",
    unresolve: "取消解决",
    changeAnnotationColor: "更改批注颜色",
    deleteAnnotation: "删除批注",
    viewAnnotation: "查看批注",
    more: "更多",
    reply: "答复",
    edit: "编辑",
    delete: "删除",
    changeColor: "更改颜色",
    deleteReply: "删除答复",

    // Margin cards
    displayName: "批注",
    openNoteFirst: "请先打开一篇 Markdown 笔记。",
    noAnnotationsYet: "这篇笔记还没有批注。选中文字后右键「添加批注」。",
    authorMe: "我",
    authorFallback: "批注",
    replyFallback: "回复",
    approxPrefix: "约 ",
    resolvedBadge: "已解决",
    writePlaceholder: "写下批注…(⌘/Ctrl + Enter 保存)",
    replyPlaceholder: "答复…",
    send: "发送",
    notSet: "未设置",

    // Settings
    languageName: "界面语言",
    languageDesc: "跟随 Obsidian 的界面语言;也可以手动选择。",
    langAuto: "自动(跟随 Obsidian)",
    langZh: "中文",
    langEn: "English",
    settingsIntro:
        "在 Markdown 原文里直接插入批注标记:选中文字,按快捷键写下批注。阅读模式只显示高亮和一个 💬 按钮,AI agent 直接读源文件即可看到全部批注。",
    defaultColorName: "默认批注颜色",
    defaultColorDesc: "添加批注时对话框里预选的颜色,每条批注之后都可以单独更改。",
    authorNameName: "批注人名称",
    authorNameDesc: "显示在批注和答复上,留空则显示「我」。",
    followName: "批注跟随正文",
    followDesc:
        "开启:批注卡片紧贴对应原文,随正文滚动(批注较多时可单独上下滚动批注栏)。关闭:批注栏按原文顺序列表显示,点击批注跳转到原文。",
    hideMarkupName: "实时预览中隐藏批注标记",
    hideMarkupDesc: "隐藏正文里的批注标记和给 AI agent 的说明(只影响实时预览;源码模式始终显示原文)。",
    hotkeyName: "添加批注快捷键",
    hotkeyDesc:
        "快捷键由 Obsidian 统一管理。点击按钮跳转到「快捷键」设置并搜索本插件的命令(添加批注、删除选中的批注、打开/关闭批注栏)。",
    setHotkey: "设置快捷键",
    howToUse: "使用方法",
    usage1: "选中文字 → 按「添加批注」的快捷键(需先在「设置 → 快捷键」里绑定)或右键「添加批注」→ 在右侧批注栏输入内容 → ⌘/Ctrl + Enter 保存。",
    usage2: "右键菜单:选中文字时有「添加批注」;光标在批注内时有「编辑 / 更改颜色 / 删除」;阅读模式下在高亮上右键同样可用。",
    usage3: "右侧批注栏的每条批注显示批注人和时间,可「答复」「解决 / 取消解决」「编辑」「改色」「删除」,并随正文滚动。批注栏在 Obsidian 右侧边栏里,左侧工具栏 💬 图标可打开 / 关闭。",
    usage4: "支持跨行、跨段落、跨列表批注。可在表格单元格内批注;选中代码块内容会批注整个代码块。",
    usage5: "源文件里批注是一对空的 <span> 标记(开头标记 + 结尾标记,批注内容写在结尾标记上),AI agent 读文件就能处理。",

    // Highlight colors (display names)
    colors: {
        yellow: "黄色",
        green: "绿色",
        blue: "蓝色",
        pink: "粉色",
        purple: "紫色",
        orange: "橙色",
    },
};
const en: typeof zh = {
    // Ribbons and commands
    ribbonMargin: "Annotation margin",
        addAnnotation: "Add annotation",
        editAtCursor: "Edit annotation at cursor",
        deleteSelected: "Delete selected annotation",
        toggleMargin: "Open/close the annotation margin",

        // Dialog
        colorLabel: "Color",
        cancel: "Cancel",
        save: "Save",

        // Notices
        commentEmpty: "The comment cannot be empty",
        selectAnnotationFirst: "Select an annotation first (click one in the margin, or put the cursor inside the annotation's text)",
        notInsideAny: "The cursor is not inside any annotation",
        couldNotLocate: "Could not locate the selected text; double-click into edit mode, then select the text",
        noTextOnLine: "No annotatable text on the cursor's line",
        noTextInSelection: "No annotatable text in the selection (selections spanning table cells or rows are not supported)",
        switchToEdit: "Switch to editing mode and select the text to annotate",
        textChanged: "The underlying text has changed; reselect it before adding the annotation",
        openHotkeyManually: "Open Settings → Hotkeys and search for \u201cannotation\u201d manually",

        // Menus and aria labels
        replyToAnnotation: "Reply to annotation",
        editAnnotation: "Edit annotation",
        resolveAnnotation: "Resolve annotation",
        unresolve: "Unresolve",
        changeAnnotationColor: "Change annotation color",
        deleteAnnotation: "Delete annotation",
        viewAnnotation: "View annotation",
        more: "More",
        reply: "Reply",
        edit: "Edit",
        delete: "Delete",
        changeColor: "Change color",
        deleteReply: "Delete reply",

        // Margin cards
        displayName: "Annotation margin",
        openNoteFirst: "Open a Markdown note first.",
        noAnnotationsYet: "No annotations in this note yet. Select text, then right-click → Add annotation.",
        authorMe: "Me",
        authorFallback: "Annotation",
        replyFallback: "Reply",
        approxPrefix: "~ ",
        resolvedBadge: "Resolved",
        writePlaceholder: "Write a comment… (⌘/Ctrl + Enter to save)",
        replyPlaceholder: "Reply…",
        send: "Send",
        notSet: "not set",

        // Settings
        languageName: "Language",
        languageDesc: "Follow Obsidian's display language, or choose manually.",
        langAuto: "Auto (follow Obsidian)",
        langZh: "中文",
        langEn: "English",
        settingsIntro:
            "Inserts annotation markers directly into the Markdown source: select text, press the hotkey, write the comment. Reading view shows only the highlight and a 💬 button; AI agents see every annotation by reading the source file.",
        defaultColorName: "Default annotation color",
        defaultColorDesc: "Color preselected in the add-annotation dialog; each annotation can be changed individually afterwards.",
        authorNameName: "Author name",
        authorNameDesc: "Shown on annotations and replies; leave empty to show \u201cMe\u201d.",
        followName: "Margin follows the text",
        followDesc:
            "On: annotation cards sit beside the text they annotate and scroll with it (the margin can scroll on its own when there are many). Off: the margin lists annotations in note order; click one to jump to its text.",
        hideMarkupName: "Hide annotation markers in live preview",
        hideMarkupDesc: "Hides annotation markers and the AI agent guide in the note body (live preview only; source mode always shows the raw text).",
        hotkeyName: "Add-annotation hotkey",
        hotkeyDesc:
            "Hotkeys are managed by Obsidian. The button opens the Hotkeys settings filtered to this plugin's commands (add annotation, delete selected annotation, open/close the margin).",
        setHotkey: "Set hotkey",
        howToUse: "How to use",
        usage1: "Select text → press the Add-annotation hotkey (bind it first under Settings → Hotkeys) or right-click → Add annotation → type the comment in the margin → ⌘/Ctrl + Enter to save.",
        usage2: "Context menu: Add annotation when text is selected; Edit / Change color / Delete when the cursor is inside an annotation; right-clicking a highlight works the same in reading view.",
        usage3: "Each annotation in the margin shows author and time, and supports reply, resolve / unresolve, edit, recolor, and delete; cards scroll with the text. The margin lives in Obsidian's right sidebar; the 💬 ribbon icon opens/closes it.",
        usage4: "Annotations can span lines, paragraphs, and lists. Table cells can be annotated; selecting inside a code block annotates the whole block.",
        usage5: "In the source file an annotation is a pair of empty <span> markers (start + end, comment on the end marker); AI agents can work with them by reading the file.",

        // Highlight colors (display names)
        colors: {
            yellow: "Yellow",
            green: "Green",
            blue: "Blue",
            pink: "Pink",
            purple: "Purple",
            orange: "Orange",
        },
};

export const STRINGS = { zh, en };

export type Locale = "en" | "zh";

/** The English dictionary must cover exactly the same keys as the Chinese one (checked at compile time above, and by a test). */

/** Active dictionary. Call setLocale() before rendering anything. */
export let t: typeof zh = zh;

export function setLocale(locale: Locale) {
    t = locale === "en" ? en : zh;
}

/** Display name of a highlight color, falling back to the key itself. */
export function colorLabel(key: string): string {
    const labels = t.colors as Record<string, string>;
    return labels[key] ?? key;
}
