# MusicBlenders 源码（可编辑工程）

这是游戏的完整可编辑源码。根目录的 `index.html` 是构建好的单文件成品（双击即玩），这里是能改代码、重新构建的源工程。

## 跑起来

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建，产物在 dist/
```

## 目录

- `src/` —— React + TypeScript 源码（组件、页面、样式、API 客户端）
- `public/` —— 图片、音频、贴纸等素材
- 其余为 Vite 构建配置

## 玩法 / 关键约定

1. 首页按任意键进入；点「创作」用左侧积木库拖拽或点 `+` 按钮把积木加到时间线。
2. 三轨 MELODY / HARMONY / RHYTHM，8 列 × 3 行。
3. 真实 AI 音乐扩展链路：前端 → relay → ACE-Step；前端不直连 8001，密钥只在后端。
4. 无后端时用预置音频兜底。
5. 原始开源基础来自 [lianghuasi/music-blocks](https://gitee.com/lianghuasi/music-blocks)（MIT，已保留 LICENSE）。
