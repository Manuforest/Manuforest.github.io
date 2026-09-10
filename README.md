# Manuforest · Blog

白底、蓝灰配色、单栏文章列表。静态 HTML + Markdown 写作台。

## 首次启用

本版替代已关闭的 PR #1。确认新 PR 构建成功后合并到 `main`；仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。必要时在 **Actions → Build and publish journal** 手动运行 `main` 分支。PR 只测试并生成预览包，不部署线上。

原有首页、文章 JSON 和图片仍保留。新版仅构建到 `_site/`，不覆盖原文件。不要再用旧 Hexo 项目强制推送整个仓库，以免覆盖新源码。

## 写作与上传

从页脚进入 `/write/`。填写 Markdown 顶部的标题、日期、分类、标签，在正文中粘贴或拖入图片；手机可切换“编辑 / 预览”。初始正文为空。

发布流程：将 `draft: true` 改为 `draft: false` → 导出文章包 → 解压 → 点“上传 GitHub”，将解压得到的文章文件夹上传到 `content/posts/` → 提交到 `main`。构建成功后网站更新。直接上传 ZIP 不会发布。

写作台支持 `.md` 导入、基础预览、图片管理、Markdown / ZIP 导出，只有一份当前本机草稿。清理浏览器数据会删除未导出的内容；新建或导入前请备份。页面不索取 GitHub Token，也不会代替你提交。完整 Markdown 排版以构建结果为准；草稿预览不联网加载外部图片。

**公开仓库的草稿并不私密。** `draft: true` 只禁止生成网站文章，提交到 GitHub 的 Markdown 仍公开。敏感草稿保存在本地。

也可从本地编辑器直接上传：

```text
content/posts/
  post-slug/
    index.md
    images/
      screenshot.png
```

文章头部使用以下字段；正文接在第二条 `---` 后：

```yaml
---
title: ""
date: 2026-09-10
category: ""
tags: []
draft: true
---
```

图片引用为 `![说明](images/screenshot.png)`。文件夹名决定链接；建议发布后不改名。可选 `slug`、`description`、`cover`、`comments: false`。首页没有封面卡片。没有 YAML 头部时使用一级标题，文件名须以 `YYYY-MM-DD` 开头。未声明 `draft` 默认发布。

相对链接用于附件，不自动转换 `.md` 文章链接；文章间用 `/post/slug.html`。缺失附件、错误日期、重复 slug 会使构建失败，避免覆盖当前线上版本。

## 界面与动效

使用参考图五个基色：`#FFFFFF`、`#D9DFDD`、`#233743`、`#98BCC6`、`#2787AA`，其他中性色由这五色混合得到。首页只保留原文标题、摘录、日期、分类和阅读时间；移除宣传句、装饰插画和侧栏。

动效参考 motionharvest/agent-skills 的 `motion-web-design`：分层淡入、分类指示线滑动、筛选列表重排、搜索弹窗进出和交互反馈。为保留静态站点及轻量构建，本版使用原生 Web Animations / IntersectionObserver 实现这些原则，没有引入 GSAP、Lenis 或强制切换 Vite。

原生滚动，无滚动劫持。手机减少位移，`prefers-reduced-motion` 关闭动画；无 JavaScript 时正文仍可见。保留主题切换、搜索、目录、RSS、站点地图和按需加载的 Twikoo。

## 旧文章

构建读取 `api/articles/*.json`，保留正文、日期、标签、图片 URL 和标题锚点，同时生成 `/post/art-X.html` 与 `/post/art-X/`。旧 JSON 不修改；旧文章尚未批量还原成 Markdown。

原图片目录继续复制；远程图床可用性需独立检查。Twikoo 使用旧 permalink 作为评论路径，后端状态和历史评论对应关系需上线后核对。关于页保留原内容，无额外介绍文案。旧归档、标签和分页入口继续兼容。

## 本地检查

使用 Python 3.12 或更新版本：

```sh
python -m pip install -r blog/requirements.txt
python -m unittest discover -s blog -p 'test_*.py' -v
python blog/build.py
python -m http.server 8000 --directory _site
```

浏览器访问 `http://localhost:8000`；不要直接双击 HTML，站内使用根路径。

## 源码

- `blog/site.json`：站点配置。
- `blog/templates/page.html`、`blog/theme.css`：页面与样式。
- `blog/motion.js`：分层进场、列表重排、弹窗与动态降级。
- `blog/site.js`：搜索、分类、主题、目录和评论。
- `blog/write.js`：本机草稿、图片、预览与导出。
- `blog/build.py`：新旧文章读取、附件处理与构建。
- `blog/test_*.py`：内容处理与极简版回归检查。
- `.github/workflows/blog.yml`：PR 检查与合并后的 Pages 部署。

## 安全与回退

原公开 `api/site.json` 含旧 Gitalk `clientSecret`。新输出不包含该配置，但已公开过的密钥需要在对应 OAuth App 设置中撤销或轮换；这里不重复密钥值。

部署仅包含 `_site/`，不输出原 API 配置、Markdown 源稿或未发布草稿独占的附件。公开仓库中的源码仍公开。

回退时停用新版 workflow，再将 Pages Source 切回 **Deploy from a branch → main / (root)**，可使用保留的旧站文件。回退前先处理旧密钥，防止重新公开旧配置。
