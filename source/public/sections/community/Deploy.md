# MusicBlock Community 运行说明

这是一个纯 HTML、CSS 和 JavaScript 的静态单页网站，不需要安装依赖，也不需要数据库。

## 方式一：直接打开

1. 打开 `WeYoung-Day1` 文件夹。
2. 双击 `index.html`。
3. 页面会使用默认浏览器打开。

## 方式二：使用本地服务器（推荐）

本地服务器更接近网站正式部署后的运行方式。

1. 打开 PowerShell。
2. 进入项目目录：

   ```powershell
   cd E:\200_program\WeYoung\WeYoung-Day1
   ```

3. 确认电脑已经安装 Node.js，然后运行：

   ```powershell
   node server.js
   ```

4. 在浏览器访问：

   ```text
   http://localhost:8080
   ```

5. 停止服务器时，在 PowerShell 中按 `Ctrl + C`。

## 文件说明

- `index.html`：社区首页、作品卡片、详情抽屉与播放器结构。
- `styles.css`：MusicBlock 拼贴视觉、桌面端与移动端响应式布局。
- `script.js`：Mock 作品数据、筛选、搜索、试听、点赞、详情与 Remix 反馈。
- `server.js`：不依赖第三方软件包的本地静态服务器，并负责加载交接包中的图片与 SVG 素材。

后续接入真实后端时，可将 `script.js` 顶部的 `tracks` Mock 数据替换为接口返回结果；卡片使用的字段已经按作品、作者、分类、互动与衍生版本拆分。若要调整品牌色，可在 `styles.css` 顶部的 `:root` 中修改 `--blue`、`--pink`、`--yellow` 等变量。
