"""Regression checks for the minimal layout, publishing and writing desk."""
import json
import unittest
from pathlib import Path
from build import frontmatter, MD, clean_content

ROOT = Path(__file__).resolve().parent.parent


class MinimalTests(unittest.TestCase):
    def test_reference_palette(self):
        css = (ROOT / 'blog/theme.css').read_text('utf-8').upper()
        for color in ('#FFFFFF', '#D9DFDD', '#233743', '#98BCC6', '#2787AA'):
            self.assertIn(color, css)
        self.assertIn('PREFERS-REDUCED-MOTION', css)

    def test_removed_decorative_copy(self):
        html = (ROOT / 'blog/templates/page.html').read_text('utf-8')
        for phrase in ('故事散场之后', '慢慢读，也慢慢写', '这个小角落',
                       'NOTES FROM MY LITTLE CORNER', 'FIELD NOTES',
                       'Made for slow reading', '把日子，一页页收好'):
            self.assertNotIn(phrase, html)
        self.assertNotIn('paper-scene', html)
        self.assertNotIn('post-card', html)
        self.assertIn('post-entry', html)

    def test_required_script_connections(self):
        html = (ROOT / 'blog/templates/page.html').read_text('utf-8')
        builder = (ROOT / 'blog/build.py').read_text('utf-8')
        for name in ('motion.js', 'site.js', 'write.js'):
            self.assertIn('/assets/' + name, html)
            self.assertIn('"' + name + '"', builder)
            self.assertTrue((ROOT / 'blog' / name).is_file())
        site = (ROOT / 'blog/site.js').read_text('utf-8')
        self.assertIn('.journal .post-entry', site)
        self.assertNotIn('.journal .post-card', site)

    def test_blank_draft(self):
        meta, body = frontmatter((ROOT / 'content/posts/_example.md').read_text('utf-8'))
        self.assertIs(meta['draft'], True)
        self.assertEqual(body.strip(), '')
        writer = (ROOT / 'blog/write.js').read_text('utf-8')
        self.assertIn("data-writer-action", writer)
        self.assertIn("#import-trigger", writer)
        self.assertIn("#image-trigger", writer)
        self.assertNotIn('把想留下的事情', writer)
        self.assertNotIn('从一句话开始', writer)

    def test_markdown_script_is_text(self):
        html, plain, toc = clean_content(MD('<script>alert(1)</script>\n\n## Title\n'))
        self.assertNotIn('<script>', html)
        self.assertIn('alert(1)', plain)
        self.assertEqual(toc[0]['text'], 'Title')

    def test_public_config_is_minimal(self):
        cfg = json.loads((ROOT / 'blog/site.json').read_text('utf-8'))
        self.assertEqual(cfg['subtitle'], '文章')
        self.assertNotIn('clientSecret', json.dumps(cfg))
        self.assertEqual(cfg['repository'], 'Manuforest/Manuforest.github.io')


if __name__ == '__main__':
    unittest.main()
