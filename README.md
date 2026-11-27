# AIGC-
存储AIGC校赛相关产品文件

## MusicBlenders（积木音乐 BLOCKS）

用积木块拼出音乐的可视化创作小游戏。单文件离线版 —— 所有图片、音频、子页面都已内联进 `index.html`，双击即可运行，无需服务器、无需联网。

## 玩法

1. 首页按任意键进入
2. 点「创作」：从左侧积木库拖拽（或点 `+` 按钮）积木到时间线
3. 三个轨道：MELODY / HARMONY / RHYTHM，最多 8 列 × 3 行
4. 点播放听效果，可调速度、换音色、加变化（Loop/Reverse/Echo/Random）
5. 首页还有「音乐墙」和「社区」两个子页面

## 说明

- 这是比赛演示版，内置预置音频作为兜底曲池。
- 完整可编辑源码见同项目源码包；原始开源基础来自 [lianghuasi/music-blocks](https://gitee.com/lianghuasi/music-blocks)（MIT 协议，已保留版权声明）。
- 技术栈：React + TypeScript + Vite（源码），构建后打包为单文件 HTML。
