# Margin Annotations(行内批注)

[English](README.md) | **简体中文**

[![Release](https://img.shields.io/github/v/release/aoldiot/margin-annotations?style=flat-square)](https://github.com/aoldiot/margin-annotations/releases/latest)
[![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22margin-annotations%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square)](https://community.obsidian.md/plugins/margin-annotations)
[![License](https://img.shields.io/github/license/aoldiot/margin-annotations?style=flat-square)](LICENSE)

**Obsidian 里的 Word 式批注:直接写在 Markdown 原文里,AI agent 读文件就能看懂并处理。**

选中文字,在右侧批注栏写下意见,可以答复、标记解决。每条批注和答复都带批注人与时间。批注在源文件里只是一对 `<span>` 标记,所以 Claude Code、Codex 这类 agent 一读文件,就知道你批的是哪句话、想怎么改。不用导出,不用复制粘贴,也不用接口。

![Margin Annotations:正文高亮,右侧批注栏里是一张张批注卡片](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/hero.png)

> 截图里的示例笔记是英文的,界面文字(批注栏、菜单、命令、设置)是插件自带的中文。

## 视频介绍

3 分钟看懂:为什么这样做、一次真实的「批完交给 Claude Code」、以及安装方法。

[![观看视频介绍](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/video-poster.jpg)](https://github.com/aoldiot/margin-annotations/blob/main/docs/media/demo.mp4)

## 为什么做

AI 写一篇稿子只要一分钟,想让它改到满意,可能要半小时:十来处要改,就得一段段复制、粘贴、说明,来回十几趟,还常常改错地方。

老师改作文,从来不会一句一句叫你过去,而是直接在原文上圈出来,旁边写一句意见,全改完,一次还给你。Margin Annotations 把这个办法搬到了笔记里:

1. **批注**:边读边批,选中文字,写下哪里不对。
2. **一次交出去**:告诉 agent「处理文件里的批注」。
3. **核对**:agent 改好原文,把每条批注标成已解决;看不懂的它不会瞎改,而是在卡片上回复提问。你可以取消解决、答复它,再来一轮。

## 功能

- 选中文字加批注,**支持跨行、跨段落、跨列表、跨标题**。
- 6 种颜色(黄、绿、蓝、粉、紫、橙),每条批注可单独更改。
- **WPS / Word 式批注栏**(Obsidian 右侧边栏):批注卡片紧贴对应原文,随正文滚动。
- **答复**(跟聊天一样的讨论串)、**解决 / 取消解决**、编辑、改色、删除;每条批注和答复都有批注人和时间。
- 实时预览、源码模式、阅读模式都能看批注(只有编辑模式才能**添加**)。
- 支持表格、代码块、渲染后的 callout(见[表格、callout 和代码块](#表格callout-和代码块))。
- 每篇有批注的笔记末尾自动写入一段隐藏的 agent 说明,一句话提示就够了。
- 文件被外部改动(比如 agent 改完)时,批注栏会跟着更新,不用重新打开笔记。

### 添加、答复、解决

选中文字,执行命令**添加批注**(命令面板、快捷键或右键菜单都行),右侧弹出一张卡片:写下意见、选颜色,按 `⌘/Ctrl + Enter` 保存。直接点一下别处也会保存(只要写了内容)。

点击卡片可以答复。卡片右上角的 **⋯** 菜单有答复、解决、编辑、更改颜色、删除。已解决的批注会变淡,并带「已解决」标签。

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/add-annotation.png" alt="新建批注的卡片:输入框、六个颜色、取消和保存按钮"></td>
<td width="50%"><img src="https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/card-menu.png" alt="带答复讨论串的批注卡片,⋯ 菜单展开:答复、解决、编辑、更改颜色、删除"></td>
</tr>
<tr>
<td align="center">写一条新批注</td>
<td align="center">答复讨论串和 ⋯ 菜单</td>
</tr>
</table>

也可以不先选中文字:什么都没选时,**添加批注**会批注光标所在的表格单元格、代码块或那一行。

### 表格、callout 和代码块

![表格单元格、callout 和代码块上的批注,以及右侧对应的卡片](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/blocks.png)

- **表格**:选中单个单元格内的文字即可批注;跨单元格、跨行的选区不支持。
- **Callout**:在实时预览里,还没有点进去编辑的 callout(仍显示为渲染效果),直接选中文字就能批注,不必先切到编辑状态。
- **代码块**:选中代码块里的任意内容,会批注**整个代码块**;标记放在围栏外侧的独立行,不会改动代码本身。
- 分隔线会被自动跳过。

### 阅读模式

阅读模式显示高亮,每条批注末尾有一个 💬 小按钮,点击查看批注内容,弹层里可以**编辑**或**删除**;在高亮上右键,菜单和批注栏的一致。阅读模式下批注栏同样可用。

![阅读模式:高亮和打开的批注弹层](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/reading-mode.png)

## 配合 AI agent 使用

批注就在笔记里,所以任何能读写文件的 agent 都能处理。比如在 Claude Code 里,引用文件再说一句就够了:

```
@草稿.md 根据文档批注修改文案
```

插件会在每篇有批注的笔记末尾写入一段隐藏说明([见下文](#隐藏的-agent-说明)),agent 已经知道规矩:

- 只处理**未解决**的批注,没有批注的内容不动;
- 按批注意见(以及答复讨论串)修改原文;
- 改完后,在该批注上加 `data-resolved="1"`,侧边栏里的卡片随之变成「已解决」。标记不会被删除;
- 有疑问就不改,而是往该批注追加一条答复,卡片上会出现这条答复。你直接在卡片上答复它,跟聊天一样,agent 下一轮能看到完整的前因后果。

如果你的 agent 没有读到那段说明,可以用更明确的提示词:

```
读取 draft.md 里所有 <span class="ann-e" ... data-note="..."> 批注。
每条批注对应的原文,是同 data-id 的 ann-s 与 ann-e 标记之间的文字。
忽略 data-resolved="1" 的已解决批注。按批注意见(以及 data-replies 里的讨论)修改原文,
改完后在该批注的 ann-e 标记上加 data-resolved="1",标记本身保留不删。
对批注有疑问就不要改,在 data-replies 里追加一条答复提问。
没有批注的内容不要改动。
```

标了「已解决」的批注下一轮会被跳过,改好的地方就不会被翻来覆去地动。想重来一次,在卡片上选「取消解决」,再补一句意见。

## 安装

**从社区插件市场安装**

1. 打开「设置 → 第三方插件」,如果开着「受限模式」,先关闭。
2. 点社区插件市场旁边的「浏览」,搜索 Margin Annotations,点「安装」再点「启用」。也可以直接打开[插件主页](https://community.obsidian.md/plugins/margin-annotations)。

**手动安装**(市场打不开时)

1. 从[最新 Release](https://github.com/aoldiot/margin-annotations/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 复制到 vault 的 `.obsidian/plugins/margin-annotations/` 目录。
3. 重启 Obsidian,在「设置 → 第三方插件」中启用 **Margin Annotations**。

需要 Obsidian 1.7.2 或更高版本。

## 设置

打开「设置 → Margin Annotations」。

![插件设置页](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/settings.png)

| 设置 | 作用 | 默认 |
|---|---|---|
| **默认批注颜色** | 添加批注时预选的颜色 | 黄色 |
| **批注人名称** | 显示在批注和答复上,留空则显示「我」 | 空 |
| **批注跟随正文** | 开:卡片紧贴对应原文,随正文滚动;关:按原文顺序列表显示,点击卡片跳转到原文 | 开 |
| **实时预览中隐藏批注标记** | 在实时预览里隐藏正文中的 `<span>` 标记和 agent 说明;源码模式始终显示原文 | 开 |
| **添加批注快捷键** | 显示当前绑定;按钮会跳到 Obsidian 的快捷键设置 | 未设置 |

**记得给「添加批注」绑一个快捷键**:这条命令默认没有快捷键。点「设置快捷键」,或到「设置 → 快捷键」搜索「批注」。不绑也行,选中文字后右键「添加批注」,就是慢一点。

## 使用

| 操作 | 方法 |
|---|---|
| 添加批注 | 编辑模式下选中文字 → 执行**添加批注** → 在右侧卡片里输入内容 → `⌘/Ctrl + Enter` |
| 答复 | 点击卡片 → 在底部输入框输入 → `Enter` 发送(`Shift + Enter` 换行) |
| 解决 / 取消解决 | 卡片右上角 ⋯ 菜单,或在高亮上右键 |
| 编辑、改色 | 卡片右上角 ⋯ 菜单 |
| 删除 | ⋯ 菜单;或选中卡片后按 `Delete` / `Backspace`;或命令**删除选中的批注**。只删除批注标记,正文一个字不动 |
| 放弃草稿 | `Esc` 或「取消」按钮 |
| 取消选中 | 点击批注栏空白处 |
| 打开 / 关闭批注栏 | 左侧工具栏图标,或命令**打开/关闭批注栏**(添加批注时批注栏会自动打开) |

光标移进批注文字,对应的卡片会被选中;阅读模式下点击高亮也一样。开启「批注跟随正文」时,滚动批注栏就是滚动正文。

**命令**

| 命令 | 作用 |
|---|---|
| 添加批注 | 给选区(或光标所在的单元格 / 代码块 / 行)添加批注 |
| 编辑光标处批注 | 编辑光标所在的批注 |
| 删除选中的批注 | 删除选中的批注 |
| 打开/关闭批注栏 | 打开或关闭右侧批注栏 |

> 阅读模式下无法添加批注(阅读视图无法可靠映射回源文件位置),请在编辑模式(源码或实时预览)下添加。

## 源文件格式(给 AI agent 看)

一条批注 = 开头标记 + 被批注的文字 + 结尾标记,**批注内容写在结尾标记的 `data-note` 上**。在源码模式下是这样(标记被淡化显示):

![源码模式:批注标记夹着被批注的文字](https://raw.githubusercontent.com/aoldiot/margin-annotations/main/docs/images/source-markup.png)

```html
<span class="ann-s" data-id="k3f9" data-color="yellow"></span>被批注的文字,可以跨多行、多个段落……
结尾这一段。<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="这几段太书面,改口语" data-author="sky" data-time="2026-10-09 13:36" data-resolved="1" data-replies="[{&#34;a&#34;:&#34;sky&#34;,&#34;t&#34;:&#34;2026-10-09 13:37&#34;,&#34;c&#34;:&#34;已改&#34;}]"></span>
```

| 属性 | 含义 |
|---|---|
| `data-id` | 开头和结尾标记用同一个 id 配对 |
| `data-color` | `yellow` / `green` / `blue` / `pink` / `purple` / `orange` |
| `data-note` | 批注内容,只在结尾标记上。HTML 实体转义,例如 `&#10;` 是换行、`&quot;` 是双引号、`&#91;` 是 `[` |
| `data-author` / `data-time` | 批注人与创建时间,格式 `YYYY-MM-DD HH:mm`(可选,旧批注没有) |
| `data-resolved="1"` | 已解决;没有该属性即未解决 |
| `data-replies` | 答复列表,JSON 数组,`a` 答复人、`t` 时间、`c` 内容(可选) |

代码块批注的两个标记放在围栏外侧的独立行;表格批注的标记包在同一个单元格的文字两侧。

### 隐藏的 agent 说明

插件会在每篇有批注的笔记末尾自动写入一段隐藏的 HTML 注释(`<!-- ann-guide:start ... ann-guide:end -->`),把上面的规则告诉 AI agent。这段注释里强调了「给 AI agent 看的,严禁删除或修改」;阅读模式中不可见,实时预览中默认隐藏(可在设置里切换),源码模式显示原文;插件升级时会自动更新,最后一条批注删除后也会一并移除。

## 已知限制

- 只有安装了本插件,阅读模式才会显示高亮;未安装时(如用 Typora 打开)标记是不可见的空 `<span>`,内容不受影响,但看不到高亮。
- 批注范围的开头/结尾若落在 `**加粗**` 这类 Markdown 语法中间,渲染可能错位。
- 重叠的多条批注在阅读模式下颜色会叠加。
- 表格批注必须在同一个单元格内;代码块批注总是覆盖整个代码块,不能只批注某几行;引用块(`>`)里的围栏代码块不会被识别为代码块。

## 开发

```bash
npm install
npm run dev     # 监听并重新构建 main.js
npm run build   # 类型检查并打包 main.js
npm test        # 批注标记逻辑(src/core.ts)的单元测试
```

把 `main.js`、`manifest.json`、`styles.css` 复制(或软链接)到 vault 的 `.obsidian/plugins/margin-annotations/` 即可试用。推送 tag 会自动创建带这三个文件的 GitHub Release。

## 许可证

[MIT](LICENSE)
