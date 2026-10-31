import hashlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import collect

class CollectorTests(unittest.TestCase):
    def test_policy(self):
        for url in ['http://arxiv.org/abs/1','https://user:pass@arxiv.org/','https://127.0.0.1/','https://evil.test/','https://arxiv.org:444/','https://arxiv.org/?token=secret','https://arxiv.org/#secret']:
            with self.subTest(url=url), self.assertRaises(ValueError): collect.validate_url(url, resolve=False)
        self.assertEqual(collect.validate_url('https://arxiv.org/abs/123', resolve=False), 'https://arxiv.org/abs/123')
    def test_private_resolution(self):
        with patch('collect.socket.getaddrinfo', return_value=[(0,0,0,'',('127.0.0.1',443))]):
            with self.assertRaises(ValueError): collect.validate_url('https://arxiv.org/')
    def result(self, **kw):
        data=dict(success=True,status_code=200,url='https://arxiv.org/abs/123',redirected_url=None,markdown=SimpleNamespace(raw_markdown='Evidence study methods results. '*50),metadata={'title':'Study'},html='')
        data.update(kw); return SimpleNamespace(**data)
    def test_bad_responses(self):
        for change in [dict(status_code=404),dict(success=False),dict(markdown=''),dict(markdown='Verify you are human '*100),dict(redirected_url='https://evil.test/')]:
            with self.subTest(change=change), self.assertRaises(ValueError): collect.source_record(self.result(**change),'https://arxiv.org/abs/123')
    def test_documentation_main_heading_selection(self):
        body='# Simple Crawling\nStudy methods results. '*20
        raw='Cloud promotional banner\n'+body
        record=collect.source_record(self.result(url='https://docs.crawl4ai.com/core/simple-crawling/',markdown=raw,metadata={'title':'Simple Crawling - Crawl4AI Documentation (v0.9.x)'}),'https://docs.crawl4ai.com/core/simple-crawling/')
        self.assertTrue(record['abstract'].startswith('# Simple Crawling'))
        self.assertNotIn('promotional banner',record['abstract'])
        self.assertEqual(record['extraction']['content_sha256'],hashlib.sha256(raw.encode()).hexdigest())
        self.assertEqual(record['extraction']['excerpt_sha256'],hashlib.sha256(body.encode()).hexdigest())
        with self.assertRaises(ValueError):
            collect.source_record(self.result(url='https://docs.crawl4ai.com/',markdown=raw,metadata={'title':'Different page'}),'https://docs.crawl4ai.com/')
    def test_content_limit(self):
        with self.assertRaises(ValueError):
            collect.source_record(self.result(markdown='a' * (collect.MAX_CONTENT_BYTES+1)), 'https://arxiv.org/abs/123')
        with self.assertRaises(ValueError):
            collect.source_record(self.result(html='a' * (collect.MAX_CONTENT_BYTES+1)), 'https://arxiv.org/abs/123')
    def test_untruncated_exact_excerpt(self):
        record=collect.source_record(self.result(), 'https://arxiv.org/abs/123')
        self.assertFalse(record['extraction']['truncated'])
        self.assertEqual(record['extraction']['content_sha256'],record['extraction']['excerpt_sha256'])
        self.assertEqual(record['extraction']['final_url'],record['url'])
    def test_metadata_hashes_and_truncation(self):
        text='Study methods results. '*2000
        record=collect.source_record(self.result(markdown=text,metadata={'title':'T'*1100}),'https://arxiv.org/abs/123')
        self.assertEqual(len(record['abstract']),20000)
        self.assertEqual(len(record['title']),1000)
        self.assertTrue(record['extraction']['truncated'])
        self.assertEqual(record['extraction']['content_sha256'],hashlib.sha256(text.encode()).hexdigest())
        self.assertEqual(record['extraction']['excerpt_sha256'],hashlib.sha256(record['abstract'].encode()).hexdigest())
        self.assertIsNone(record['year']); self.assertEqual(record['authors'],[])

if __name__ == '__main__': unittest.main()
