# HTML 层功能补丁（demo-and-autosave.txt）

这是舍友以「直接改单文件 HTML」的方式交付的一处更新，已移植并合入根目录 `index.html`。

## 功能

1. **一键示例作品**：右下角「✨ 载入示例作品」按钮，点击后自动铺好 2 页 16 拍共 32 块示例（示例 · 夜色列车），点播放即可试听。会确认是否替换当前画布。
2. **自动保存**：积木布局自动存入浏览器 `localStorage`（键 `musicblocks.project.v1`），刷新后自动恢复；右下角有「已自动保存」提示。

## 移植说明

- 补丁为自包含的 `<style id="mb-patch-style">` + `<script>`，放在主程序 `</script>` 之后、`</body>` 之前。
- 依赖主程序把状态 store 挂到 `window.__MB_STORE__`（主程序 `const Z=window.__MB_STORE__=$m(...)` 一行）。
- **修复记录**：舍友原补丁的示例数据用了 `piano2` 这个 blockId，但主程序积木定义表里没有它，渲染时读 `undefined.color` 会白屏。已将示例中该块统一改为 `piano`。此文件为修复后的版本，与 `index.html` 内嵌补丁一致。

## 兼容

此补丁叠加在已修复版本之上：贴纸 hat 别名、音乐墙图标查表、社区锚点拦截、轨道满提示均保留。
