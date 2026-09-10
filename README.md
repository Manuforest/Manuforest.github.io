# Manuforest · 个人随记

米白 / 灰绿、纸张质感、中文长文排版。静态 HTML 阅读页 + 本机 Markdown 写作台。

## 第一次启用

1. 合并本次改版 PR 到 `main`。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Build and publish journal** 查看构建；必要时选择 **Run workflow**，分支用 `main`。
4. 等待该次运行的 build 和 deploy 成功，再访问博客。PR 构建只校验并生成下载预览，不部署线上。

原来的 `index.html`、`static/`、`api/`、图片都留在仓库。新构建只生成 `_site/`，从原 `api/articles/*.json` 读取旧文章。不要再从旧 Hexo 项目强制推送整个仓库，否则可能覆盖新源码。

## 最省事的写作方法

网站页脚进入 **写作台**（`/write/`）：

1. 修改 Markdown 顶部的标题、日期、分类、标签。文件夹名决定链接。
2. 写正文；图片可选择、粘贴或拖入编辑框。当前草稿和图片保存在浏览器 IndexedDB。
3. 准备发布时将 `draft: true` 改成 `draft: false`。
4. 点 **下载文章包**，解压 ZIP；点 **打开 GitHub 上传页**，将解压得到的文章文件夹拖进去并提交到 `main`。
5. 自动构建通过后网站更新。直接上传 ZIP 不会发布，必须解压。

写作台不处理 GitHub 登录，不需要 Token，也不替你执行提交。全文与图片不发送到外部编辑器。只有一个当前本机草稿；新建或导入前请下载备份，清理浏览器数据会删除未导出的内容。基础预览覆盖标题、段落、引用、列表、代码和本地图片；表格等完整语法以构建后的页面为准。

**公开仓库中的文件不是秘密。** `draft: true` 只禁止生成网站文章和该草稿独占的附件，不会让已提交到 GitHub 的 Markdown 私密。敏感草稿保存在本地，不要上传。

## 已经在本地写好 Markdown

无需使用写作台。推荐每篇文章一个文件夹，上传到 `content/posts/`：

```text
content/posts/
  my-note/
    index.md
    images/
      screenshot.png
```

`index.md` 示例：

```markdown
---
title: "记一次值得留下的事情"
date: 2026-09-10
category: "随记"
tags: ["日常", "创作"]
draft: false
---

## 从这里开始

正文……

![截图说明](images/screenshot.png)
```

也可直接上传 `2026-09-10-note.md`，图片放到它旁边的 `images/`。不带 YAML 头部时，以一级标题为文章标题，文件名必须以日期开头。带 YAML 时填写 `date`，避免每次构建改变发布日期。文件/文件夹名支持中文；建议使用短英文名，并且发布后不再随意改名。

额外可用字段：`slug`（自定义链接标识）、`description`（列表摘要）、`cover`（保留封面数据）、`comments: false`（关闭该文评论）。当前首页采用纯文字卡片，不依赖封面图。未声明 `draft` 的文章默认发布；草稿必须明确写 `draft: true`。

使用根路径 `/post/文章标识.html` 链接到其他文章。相对链接用于附件；相对 `.md` 文章链接目前不转换，构建会提示错误。附件只支持图片、PDF 和常见音视频文件。仅复制已发布文章实际引用的附件；未引用的附件不会输出。图片路径或日期有错会让构建失败，旧版线上不会因此被替换。

## 保留了哪些旧内容

- 旧文章原始 JSON 不修改；构建读取标题、正文、日期、标签、图片链接与标题锚点，清理可执行 HTML 和内联样式。
- 同时生成 `/post/art-X.html` 与 `/post/art-X/`，兼容有无 `.html` 的旧入口。
- 旧图片目录和文章旁的图片继续复制，远程图片 URL 原样保留；远程图床是否仍可用需独立检查。
- 原 Twikoo 服务按需加载。评论使用旧 JSON 的 permalink 作为路径标识；服务可用性、历史评论对应关系仍需上线后核对，不保证旧后端仍在线。
- 关于页、留言板、归档、标签入口保留；旧分页入口转向完整归档。
- 新旧文章 slug 冲突会报错，不会静默覆盖旧文章。旧文目前仍从 JSON 读取，批量还原 Markdown 属于后续独立迁移工作。

## 本地预览与检查

Python 3.12 或更新版本：

```sh
python -m pip install -r blog/requirements.txt
python -m unittest discover -s blog -p 'test_*.py' -v
python blog/build.py
python -m http.server 8000 --directory _site
```

浏览器打开 `http://localhost:8000`。不要直接双击 `_site/index.html`，站内使用根路径。

## 可维护的文件位置

- `blog/site.json`：站点名称、描述、作者、仓库地址、评论服务地址。
- `blog/templates/page.html`：首页、文章、归档、标签、写作台的页面结构。
- `blog/theme.css`：色彩、字号、间距、响应式、深色模式、打印样式。
- `blog/site.js`：搜索、筛选、主题切换、目录、代码复制、按需评论。
- `blog/write.js`：本机草稿、图片管理、基础预览、ZIP 导出。
- `blog/build.py`：新旧内容读取、静态页面、RSS、站点地图与附件处理。
- `.github/workflows/blog.yml`：PR 校验、构建与主分支部署。

## 安全与回退

原公开 `api/site.json` 中包含旧 Gitalk 的 `clientSecret` 字段。本次新站输出不包含该文件，但仓库历史和旧站仍可能有副本。请在对应 GitHub OAuth App 设置中**撤销/轮换该密钥**；不要认为隐藏文件就等于撤销凭据。这里不重复密钥值。

部署到 Pages 的仅为 `_site/`，不包含源码目录、原 API 配置或 Markdown 草稿。搜索、RSS 同样只包含已发布文章。

需要回退时，将 Pages Source 切回 **Deploy from a branch → main / (root)** 可使用仍保留的旧站文件；同时停用 `Build and publish journal` workflow，避免下次提交重新部署新版。回退旧站会重新公开旧配置，因此先处理遗留密钥。

官方说明：
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
