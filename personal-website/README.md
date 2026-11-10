# 胖达的个人网站

朱新达（网名胖达）的浅蓝科技风个人主页，包含 CS2、LOL、三国杀、三角洲游戏介绍与类型筛选。

## 文件

- `dist/index.html`：完整网页源码。HTML、CSS、JavaScript、SVG 插画均内嵌，无外部依赖。
- `.openai/hosting.json`：原 Sites 部署配置，不含访问凭据。

## 打开与修改

下载本文件夹，用浏览器打开 `dist/index.html` 即可使用，无需安装或构建。使用文本编辑器修改该文件即可调整内容、样式和交互。

这份仓库备份独立于聊天与 Sites 保存。未来网页更新需要再次提交到 GitHub；本次上传不建立自动同步。

## GitHub Pages

公开访问地址：https://pangda-x.github.io/pangda-x-/

发布源是 `main` 分支的 `/docs` 目录，实际线上入口为 `docs/index.html`。修改网站时，请同时更新 `personal-website/dist/index.html` 和 `docs/index.html`。提交后 GitHub Pages 自动重新构建部署。Sites 的修改不会自动推送到此仓库。
