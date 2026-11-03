# 在线文档：界面仓与数据仓分离

界面仓：`shalom-lab/online-doc`。预期发布地址：`https://shalom-lab.github.io/online-doc/`。

基于 ranuts/document，保留 AGPL-3.0 LICENSE、NOTICE 及源码。此改版加入中文 GitHub 文档库入口，通过同源嵌入 API 使用上游 Office 编辑器。

## BYOK

设置页填写独立数据仓 `owner/repo` 和仅限该仓库 Contents 读写权限的 fine-grained PAT。可用私有数据仓，先初始化 README。凭据仅在当前浏览器 localStorage 中保存，浏览器直连 api.github.com，不经代理，不放入 Actions。

- `gh-online-doc-repo`
- `gh-online-doc-token`

可 Settings 填写，也可事先写入 localStorage；启动会自动读。换设备需重新填写。GitHub Pages 同一域下的其他应用共享 localStorage，请仅在可信设备及可信 Pages 域使用。

## 文档管理

支持 DOCX、XLSX、PPTX、PDF 文件列表、上传、预览、编辑、提交保存和删除；新建支持前三种格式。当前版本支持 20 MB 以内文件；大于 1 MB 的文档使用 Git Blob API 读取。保存和删除携带打开时的 SHA；冲突时不自动覆盖。保存失败保留编辑器内容，可以重试。尚未进行真实 Token 的端到端提交验证。

## CI/CD

默认首页源码为根目录 `index.html`，直接显示中文文档库。`pnpm build` 的 `dist/index.html` 在所有平台保持相同入口，EO 使用构建命令 `pnpm build`、输出目录 `dist`。`public/library.html` 和各语言首页由构建流程从该首页生成，修改首页请编辑根目录文件。GitHub Pages 脚本只负责子路径和托管兼容处理，不再替换首页。

Node 24，pnpm 11.4.0，安装锁定依赖、执行上游构建、运行 Pages 适配，再上传 dist。Settings → Pages → Source 设为 GitHub Actions。main 推送自动部署，PR 只构建。

本地：`pnpm install --frozen-lockfile`、`pnpm build`、`node bin/github-pages.mjs`。构建脚本需要 Bash（Windows 可使用 Git Bash）。上游包含大体积 Office/WASM 资源，需核验 Pages 发布体积及子路径行为。

生产构建与 BYOK 模拟 API 测试已通过。Pages 适配仍待浏览器验证：包含路径前缀处理和 Brotli WASM 解压。正式上线前必须验证编辑器初始化、中文输入、三种 Office 格式保存及预览。此文件不代表部署成功。

文档统一保存在数据仓 online-doc-data/ 下，上传与新建首次提交时自动创建目录。列表仅显示此目录下文档；旧文件不自动迁移。
