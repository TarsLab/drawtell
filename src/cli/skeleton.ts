/**
 * 工作区骨架清单:init 建、doctor 查——同一张清单,两个消费方(否则两边各写一遍必然漂移)。
 * docs/文件系统.md「工作区布局」是它的人读版。
 *
 * 两组目录,边界不变(文件系统.md「边界」节):
 *  - CORE:CLI 自己读写的(scenes/;bundles/snaps 是派生根,首次 build/snap 自建,不进骨架)。
 *  - FAMILY:子产品目录(homework 作业 / reading 朗读 / canvas 画板的工作流与应用层读写)。
 *    CLI 不碰其内容,只在 init 建空目录、在 doctor 报缺失——脚手架是便民,不是越界:
 *    缺了它们的症状全是静默空列表(如 books/ 缺失时 reading 的 /reading/* 落空),值得体检。
 */

export const CORE_DIRS = ['scenes'] as const;
export const FAMILY_DIRS = ['problems', 'captures', 'homework', 'tools', 'books'] as const;

/** 进 git 的空目录用 .gitkeep 占位;books/ 整目录可再生不入库(见 GITIGNORE),不占位。 */
export const NO_GITKEEP = new Set(['books']);

export const GITIGNORE = `# 派生物不在工作区(bundles/snaps 缺省在工作区下,建议经 drawtell.json 的 paths
# 指到 ~/.cache/drawtell/<名>/),这里兜底防手滑
bundles/
snaps/
node_modules/
.DS_Store

# books/ 整目录可再生(内容出自 reading 工作流、音频出自 TTS,voxtell 缓存可回填),不入库
books/
`;

/**
 * drawtell.json 模板:只在文件不存在时写入。政策文件永不自动重建或覆盖——
 * hyperframes 式的"缺配置就重建"对可再生的项目文件成立,对承载家长决定的政策文件等于机器替人拍板。
 */
export const CONFIG_TEMPLATE = `{
  "title": "drawtell",
  "paths": {},
  "dub": {},
  "_note": "工作区政策,家长确认后改这里;机器不会自动重建或覆盖本文件,写坏了靠 git 回退,drawtell doctor 可体检。title = 孩子端界面标题。paths = 目录角色映射:bundles/snaps 是派生物,可挪出工作区(如 ~/.cache/drawtell/<名>/bundles);photos/notes/kids/inbox/attachments 是家长面角色,可指到 Obsidian vault 的绝对路径(双根布局见 drawtell 仓 docs/文件系统.md)。dub = 配音政策:voice 没有默认值(音色是家长的选择),候选看 voxtell voices,试听 voxtell preview <voice>。"
}
`;
