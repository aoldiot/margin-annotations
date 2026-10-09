# Margin Annotations(行内批注)

Word-style annotations for Obsidian: select text, write a comment in the sidebar, reply, resolve or delete it. Annotations are stored as `<span>` markers in the markdown source, so AI agents can read them straight from the file. (Chinese UI; details below.)

> Note: adding or editing an annotation modifies the note's source text (inserts a pair of `<span>` markers).

在 Markdown **原文**里直接添加批注的 Obsidian 插件。批注就是源文件里的一对标记,所以 AI agent(Claude Code 等)读文件就能看到并处理,不需要导出、不需要接口。

## 功能

- 选中文字加批注,**支持跨行、跨段落、跨列表、跨标题**
- 6 种颜色(黄、绿、蓝、粉、紫、橙),每条批注可单独更改
- **阅读模式**只显示高亮和一个 💬 按钮,点击查看批注(可在弹层里编辑 / 删除)
- **WPS 式批注栏(Obsidian 右侧边栏)**:批注卡片紧贴对应原文、随正文滚动;选中文字后直接在右侧填写批注;每条批注显示批注人和时间,支持**答复**、**解决 / 取消解决**、编辑、改色、删除
- **右键菜单**:编辑模式有「添加批注」,光标在批注内有「编辑 / 更改批注颜色 / 删除批注」;阅读模式在高亮上右键同样可用
- 代码块、表格、分隔线会被自动跳过,不会被插入标记

## 安装

把 `main.js`、`manifest.json`、`styles.css` 三个文件复制到 vault 的 `.obsidian/plugins/margin-annotations/` 目录,然后在 Obsidian「设置 → 第三方插件」中启用「行内批注」。

## 使用

| 操作 | 方法 |
|---|---|
| 添加批注 | 编辑模式下选中文字 → 「添加批注」快捷键(在「设置 → 快捷键」中绑定) → 在右侧批注栏输入内容、选颜色 → `⌘/Ctrl + Enter` 保存 |
| 查看批注 | 右侧批注栏(阅读/编辑模式都有);阅读模式也可点击 💬 |
| 答复 / 解决 / 编辑 / 改色 / 删除 | 批注卡片右上角 ⋯ 菜单;右键菜单;点击卡片后底部输入框直接答复 |
| 打开 / 关闭批注栏 | 左侧工具栏 💬 图标,或命令面板「打开/关闭批注栏」 |

快捷键可以在「设置 → 快捷键」中搜索「添加批注」修改。

> 阅读模式下无法直接添加批注(阅读视图无法可靠映射回源文件位置),请在编辑模式(源码或实时预览)下添加。

## 源文件格式(给 AI agent 看)

一条批注 = 开头标记 + 被批注的文字 + 结尾标记,**批注内容写在结尾标记的 `data-note` 上**:

```html
<span class="ann-s" data-id="k3f9" data-color="yellow"></span>被批注的文字,可以跨多行、多个段落……
结尾这一段。<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="这几段太书面,改口语" data-author="sky" data-time="2026-10-09 13:36" data-resolved="1" data-replies="[{&#34;a&#34;:&#34;sky&#34;,&#34;t&#34;:&#34;2026-10-09 13:37&#34;,&#34;c&#34;:&#34;已改&#34;}]"></span>
```

- `data-id`:开头和结尾标记用同一个 id 配对
- `data-color`:`yellow` / `green` / `blue` / `pink` / `purple` / `orange`
- `data-author` / `data-time`:批注人与创建时间(可选,旧批注没有)
- `data-resolved="1"`:已解决(没有该属性即未解决)
- `data-replies`:答复列表,JSON 数组,`a`=答复人、`t`=时间、`c`=内容(可选)
- `data-note`:批注内容。HTML 实体转义,例如 `&#10;` 是换行、`&quot;` 是双引号、`&#91;` 是 `[`

### 让 agent 处理批注的提示词示例

```
读取 xxx.md 里所有 <span class="ann-e" ... data-note="..."> 批注。
每条批注对应的原文,是同 data-id 的 ann-s 与 ann-e 标记之间的文字。
忽略 data-resolved="1" 的已解决批注。按批注意见(以及 data-replies 里的讨论)修改原文;改完后删除这条批注的两个标记(ann-s 和 ann-e)。
没有批注的内容不要改动。
```

## 已知限制

- 只有安装了本插件,阅读模式才会显示高亮;未安装时(如用 Typora 打开)标记是不可见的空 `<span>`,内容不受影响,但看不到高亮。
- 批注范围的开头/结尾若落在 `**加粗**` 这类 Markdown 语法中间,渲染可能错位。
- 重叠的多条批注在阅读模式下颜色会叠加。
- 表格单元格、代码块内不能加批注。
