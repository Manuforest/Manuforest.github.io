import json
import tempfile
import unittest
from pathlib import Path
from build import frontmatter, load_posts, clean_content, slugify


class BlogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'api/articles').mkdir(parents=True)
        (self.root / 'content/posts').mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def post(self, name, source):
        path = self.root / 'content/posts' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding='utf-8')
        return path

    def test_legacy_keeps_content_and_anchor(self):
        data = dict(slug='art-1', title='旧文章', date='2023-10-27',
                    content='<h2 id="旧标题">旧标题</h2><p>正文<img src="/images/1.png"></p>',
                    categories=[{'name':'GalNotes'}], tags=[{'name':'Gal笔记'}])
        (self.root/'api/articles/art-1.json').write_text(json.dumps(data), encoding='utf-8')
        p = load_posts(self.root)[0]
        self.assertIn('正文', p['body'])
        self.assertIn('/images/1.png', p['body'])
        self.assertEqual(p['toc'][0]['id'], '旧标题')
        self.assertEqual(p['url'], '/post/art-1.html')
        self.assertEqual(p['category'], 'Gal 笔记')

    def test_draft_and_unused_assets_not_published(self):
        self.post('private/index.md', '---\ntitle: Private\ndraft: true\n---\nSecret')
        self.assertEqual(load_posts(self.root), [])

    def test_nested_images_unicode_and_markdown(self):
        p = self.post('测试/index.md', '---\ntitle: 测试\ndate: 2026-09-10\ntags: [中文]\n---\n## 标题\n\n![图](images/图片.png)\n\n|A|B|\n|-|-|\n|1|2|')
        (p.parent/'images').mkdir()
        (p.parent/'images/图片.png').write_bytes(b'image-fixture')
        post = load_posts(self.root)[0]
        self.assertEqual(len(post['assets']), 1)
        self.assertIn('<table>', post['body'])
        self.assertIn('/media/posts/', post['body'])
        self.assertEqual(post['tags'], ['中文'])

    def test_duplicate_slugs_fail(self):
        self.post('a.md', '---\nslug: same\ndate: 2026-09-10\n---\nA')
        self.post('b.md', '---\nslug: same\ndate: 2026-09-10\n---\nB')
        with self.assertRaisesRegex(ValueError, '重复'):
            load_posts(self.root)

    def test_missing_and_escaping_assets_fail(self):
        self.post('a.md', '---\ndate: 2026-09-10\n---\n![x](../../outside.png)')
        with self.assertRaisesRegex(ValueError, '附件'):
            load_posts(self.root)

    def test_strict_dates_and_frontmatter(self):
        with self.assertRaises(ValueError):
            frontmatter('---\ntitle: x\nbody')
        self.post('a.md', '---\ndate: invalid\n---\nText')
        with self.assertRaises(ValueError):
            load_posts(self.root)

    def test_draft_type_and_date_required(self):
        self.post('a.md', '---\ndraft: "false"\ndate: 2026-09-10\n---\nText')
        with self.assertRaises(ValueError):
            load_posts(self.root)
        self.post('a.md', '# 无日期')
        with self.assertRaises(ValueError):
            load_posts(self.root)

    def test_clean_content_blocks_executable_markup(self):
        body, text, toc = clean_content('<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><svg onload="x"></svg><p>Safe</p>')
        self.assertNotIn('script', body)
        self.assertNotIn('onerror', body)
        self.assertNotIn('onload', body)
        self.assertEqual(text, 'Safe')

    def test_unicode_frontmatter_roundtrip(self):
        meta, body = frontmatter('\ufeff---\r\ntitle: "中文: 标题"\r\ndate: 2026-09-10\r\n---\r\n正文')
        self.assertEqual(meta['title'], '中文: 标题')
        self.assertEqual(body, '正文')
        self.assertEqual(slugify('../逃逸/a'), '逃逸-a')


if __name__ == '__main__':
    unittest.main()
