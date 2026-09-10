"""Build a static journal from existing Hexo exports and new Markdown.

Run: python blog/build.py
Only _site/ is replaced. Original articles and assets are never rewritten.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import re
import shutil
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
import xml.etree.ElementTree as ET

import mistune
import yaml
from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
CONTENT = ROOT / "content" / "posts"
MD = mistune.create_markdown(escape=True, plugins=["table", "strikethrough", "task_lists", "url"])
LABELS = {"GalComments": "Gal 简评", "GalNotes": "Gal 笔记", "AniComments": "动画随记", "test": "旧日札记"}
ASSETS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg", ".pdf", ".mp3", ".mp4", ".ogg", ".wav"}


def slugify(value: str) -> str:
    value = re.sub(r"[^\w-]+", "-", str(value).strip(), flags=re.UNICODE).strip("-_ ")
    if not value or value in {".", ".."}:
        raise ValueError("文章文件名 / slug 不能为空")
    return value


def frontmatter(text: str) -> tuple[dict, str]:
    text = text.lstrip("\ufeff").replace("\r\n", "\n")
    if not text.startswith("---\n"):
        return {}, text
    match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", text, re.S)
    if not match:
        raise ValueError("YAML 头部缺少结束的 ---")
    meta = yaml.safe_load(match.group(1)) or {}
    if not isinstance(meta, dict):
        raise ValueError("YAML 头部必须是键值对象")
    return meta, text[match.end():]


def date_of(value, fallback: str = "1970-01-01") -> str:
    value = str(value or fallback)[:10]
    dt.date.fromisoformat(value)  # Bad dates should fail CI, not silently publish.
    return value


def names(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [s.strip() for s in re.split(r"[,，]", value) if s.strip()]
    return [str(v.get("name", "")) if isinstance(v, dict) else str(v) for v in value]


def clean_content(source: str) -> tuple[str, str, list[dict]]:
    """Keep legacy text/images/anchors; remove executable markup from exports."""
    soup = BeautifulSoup(source, "html.parser")
    for node in soup.select("script, style, iframe, object, embed, form, link, meta, base"):
        node.decompose()
    allowed = set("p a img h1 h2 h3 h4 h5 h6 div span ul ol li table thead tbody tfoot tr th td hr br strong em b i s del blockquote pre code sup sub details summary input video audio source figure figcaption mark".split())
    for node in list(soup.find_all(True)):
        if node.name not in allowed:
            node.unwrap()
            continue
        for key in list(node.attrs):
            if key.lower().startswith("on") or key.lower() in {"srcdoc", "formaction", "srcset", "style"}:
                del node.attrs[key]
        for attr in ("href", "src", "xlink:href"):
            if attr in node.attrs:
                url = re.sub(r"[\x00-\x20]+", "", str(node[attr]))
                if urlsplit(url).scheme.lower() not in {"", "http", "https", "mailto"}:
                    del node.attrs[attr]
        if node.name == "input":
            node["disabled"] = ""
            node["type"] = "checkbox"
        if node.name == "img":
            node["loading"] = "lazy"
            node["decoding"] = "async"
            node["alt"] = node.get("alt", "")
        if node.name == "a" and str(node.get("href", "")).startswith(("http://", "https://")):
            node["rel"] = "noopener noreferrer"
    used = {str(n["id"]) for n in soup.select("[id]")}
    toc = []
    for index, heading in enumerate(soup.find_all(["h2", "h3"]), 1):
        if not heading.get("id"):
            anchor = f"section-{index}"
            while anchor in used:
                anchor += "-"
            heading["id"] = anchor
            used.add(anchor)
        toc.append({"id": heading["id"], "text": heading.get_text(" ", strip=True), "level": int(heading.name[1])})
    return str(soup), soup.get_text(" ", strip=True), toc


def load_posts(root: Path = ROOT) -> list[dict]:
    posts = {}
    for path in sorted((root / "api/articles").glob("*.json")):
        data = json.loads(path.read_text("utf-8"))
        if data.get("hidden"):
            continue
        slug = slugify(data["slug"])
        body, text, toc = clean_content(data.get("content", ""))
        cats = names(data.get("categories"))
        posts[slug] = dict(slug=slug, title=data["title"], date=date_of(data.get("date")),
            description=text[:125], body=body, text=text, toc=toc, tags=names(data.get("tags")),
            category=LABELS.get(cats[0], cats[0]) if cats else "随记", cover=data.get("cover") or "",
            legacy=True, source=str(path.relative_to(root)),
            comment_path=data.get("permalink") or f"/post/{slug}", comments=data.get("comments", True))
    content = root / "content/posts"
    for path in sorted(content.rglob("*.md")):
        meta, text = frontmatter(path.read_text("utf-8"))
        if "draft" in meta and not isinstance(meta["draft"], bool):
            raise ValueError(f"{path}: draft 请使用 true 或 false，不要加引号")
        if meta.get("draft", False):
            continue
        filename_slug = path.parent.name if path.stem == "index" else path.stem
        slug = slugify(meta.get("slug", filename_slug))
        if slug in posts:
            raise ValueError(f"重复 slug: {slug}；请改名，旧文章不会被隐式覆盖")
        title_match = re.search(r"^#\s+(.+)$", text, re.M)
        title = str(meta.get("title") or (title_match.group(1) if title_match else filename_slug))
        if title_match and title_match.group(1).strip() == title.strip():
            text = text[:title_match.start()] + text[title_match.end():]
        # Without a date, use a YYYY-MM-DD filename prefix. Requiring an explicit date
        # otherwise keeps publication dates stable between clean GitHub checkouts.
        prefix = re.match(r"^(\d{4}-\d{2}-\d{2})", filename_slug)
        if not meta.get("date") and not prefix:
            raise ValueError(f"{path}: 请填写 date: YYYY-MM-DD，或用日期开头的文件名")
        date = date_of(meta.get("date") or prefix.group(1))
        soup = BeautifulSoup(MD(text), "html.parser")
        used_assets = []

        def resolve_asset(url: str) -> str:
            parsed = urlsplit(str(url))
            if parsed.scheme or parsed.netloc or url.startswith(("/", "#")):
                return url
            target = (path.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(content.resolve()):
                raise ValueError(f"{path}: 附件必须放在 content/posts 内: {url}")
            if not target.is_file() or target.suffix.lower() not in ASSETS:
                raise ValueError(f"{path}: 附件不存在或类型不受支持: {url}")
            relative = target.relative_to(content.resolve())
            used_assets.append((target, Path("media/posts") / relative))
            suffix = ("?" + parsed.query if parsed.query else "") + ("#" + parsed.fragment if parsed.fragment else "")
            return "/media/posts/" + quote(relative.as_posix()) + suffix

        for node in soup.select("img[src], a[href]"):
            attr = "src" if node.name == "img" else "href"
            url = str(node[attr])
            if url and not url.startswith(("#", "/")) and not urlsplit(url).scheme and not urlsplit(url).netloc:
                node[attr] = resolve_asset(url)
        cover = resolve_asset(str(meta["cover"])) if meta.get("cover") else ""
        body, plain, toc = clean_content(str(soup))
        posts[slug] = dict(slug=slug, title=title, date=date, description=str(meta.get("description") or plain[:125]),
            body=body, text=plain, toc=toc, tags=names(meta.get("tags")), category=str(meta.get("category") or "随记"),
            cover=cover, legacy=False, source=str(path.relative_to(root)), comment_path=f"/post/{slug}",
            comments=meta.get("comments", True), assets=used_assets)
    for post in posts.values():
        post["url"] = f'/post/{quote(post["slug"])}.html'
        post["minutes"] = max(1, math.ceil(len(post["text"]) / 450))
    return sorted(posts.values(), key=lambda p: (p["date"], p["slug"]), reverse=True)


def write(path: str, content: str) -> None:
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, "utf-8")


def build() -> None:
    config = json.loads((ROOT / "blog/site.json").read_text("utf-8"))
    posts = load_posts()
    if not posts:
        raise ValueError("没有可发布文章；请先检查旧 JSON 或 Markdown")
    # Validate first, then rebuild only the disposable output directory.
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for directory in ("images", "icons", "svg"):
        if (ROOT / directory).exists():
            shutil.copytree(ROOT / directory, OUT / directory, symlinks=False)
    if (ROOT / "favicon.ico").exists():
        shutil.copy2(ROOT / "favicon.ico", OUT / "favicon.ico")
    # Keep old post-local image paths, but do not copy the old SPA or public config.
    for file in (ROOT / "post").rglob("*"):
        if file.is_file() and file.suffix.lower() in ASSETS:
            dest = OUT / file.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, dest)
    for post in posts:
        for source, relative in post.get("assets", []):
            target = OUT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    for filename in ("theme.css", "site.js", "write.js"):
        target = OUT / "assets" / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / "blog" / filename, target)
    env = Environment(loader=FileSystemLoader(ROOT / "blog/templates"), autoescape=select_autoescape(["html"]))
    template = env.get_template("page.html")
    counts = {category: sum(p["category"] == category for p in posts) for category in dict.fromkeys(p["category"] for p in posts)}

    tags = {tag: [p for p in posts if tag in p["tags"]] for tag in sorted({t for p in posts for t in p["tags"]})}

    def page(kind, title, url, **kwargs):
        return template.render(kind=kind, title=title, canonical=config["url"] + url,
            config=config, posts=posts, counts=counts, tags=tags, year=dt.date.today().year,
            repo=f'https://github.com/{config["repository"]}', **kwargs)

    write("index.html", page("home", config["subtitle"], "/"))
    write("archives/index.html", page("archives", "文章归档", "/archives/"))
    write("tags/index.html", page("tags", "分类与标签", "/tags/"))
    for post in posts:
        rendered = page("post", post["title"], post["url"], post=post)
        write(f'post/{post["slug"]}.html', rendered)
        write(f'post/{post["slug"]}/index.html', rendered)
    about_path = ROOT / "api/pages/about/index.json"
    about = "<p>关于 Galgame、动画，以及值得留下的日常。</p>"
    if about_path.exists():
        about = clean_content(json.loads(about_path.read_text("utf-8")).get("content", about))[0]
    for path in ("about/index.html", "page/about/index.html", "page/about.html"):
        write(path, page("about", "关于这里", "/about/", about=about))
    for path in ("page/message-board/index.html", "page/message-board.html"):
        write(path, page("message", "留言板", "/page/message-board/"))
    for tag in tags:
        anchor = quote(tag)
        redirect = f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/tags/#{anchor}"><a href="/tags/#{anchor}">查看标签</a>'
        safe = slugify(tag)
        write(f"tags/{safe}.html", redirect)
        write(f"tags/{safe}/index.html", redirect)
    # Preserve other legacy archive/pagination entry points as archive redirects.
    for folder in ("archives", "page"):
        for old in (ROOT / folder).rglob("*.html"):
            relative = old.relative_to(ROOT).as_posix()
            if not (OUT / relative).exists():
                write(relative, '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/archives/"><a href="/archives/">文章归档</a>')
    write("write/index.html", page("write", "写作台", "/write/"))
    write("404.html", page("404", "这一页暂时不在这里", "/404.html"))
    index = [{k: p[k] for k in ("title", "date", "description", "text", "tags", "category", "url")} for p in posts]
    write("search.json", json.dumps(index, ensure_ascii=False))
    # No raw Markdown, draft attachments, legacy API config or credentials in _site.
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    for tag, value in (("title", config["title"]), ("link", config["url"]), ("description", config["description"])):
        ET.SubElement(channel, tag).text = value
    for post in posts[:30]:
        item = ET.SubElement(channel, "item")
        for tag, value in (("title", post["title"]), ("link", config["url"] + post["url"]),
                           ("guid", config["url"] + post["url"]), ("description", post["description"])):
            ET.SubElement(item, tag).text = value
    write("feed.xml", ET.tostring(rss, encoding="unicode", xml_declaration=True))
    sitemap = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for url in ["/", "/archives/", "/tags/", "/about/"] + [p["url"] for p in posts]:
        ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = config["url"] + url
    write("sitemap.xml", ET.tostring(sitemap, encoding="unicode", xml_declaration=True))
    write("robots.txt", f'User-agent: *\nAllow: /\nDisallow: /write/\nSitemap: {config["url"]}/sitemap.xml\n')
    write(".nojekyll", "")
    print(f"Built {len(posts)} articles ({sum(p['legacy'] for p in posts)} preserved legacy) into _site/")


if __name__ == "__main__":
    build()
