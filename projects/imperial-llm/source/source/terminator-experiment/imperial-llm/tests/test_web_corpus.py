"""Offline checks: python -m unittest tests.test_web_corpus -v."""
import io
import json
import tempfile
import time
import unittest
from argparse import Namespace
from email.message import Message
from pathlib import Path
from unittest.mock import patch

from scripts import prepare_web_corpus as web


class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        sleeper = patch.object(web.time, "sleep")
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        self.body = ("The little cat played in a sunny garden with a friend. " * 8).encode()
        self.source = {"url": "https://example.org/story.txt", "license": "CC0-1.0",
                       "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                       "attribution": "Example author", "sha256": web.sha(self.body)}
        self.allow = self.path / "sources.json"
        self.allow.write_text(json.dumps({"sources": [self.source]}))
        self.exclude = self.path / "exclude.jsonl"
        self.exclude.write_text("")
        self.args = Namespace(allowlist=self.allow, exclude=[self.exclude], output=self.path / "out",
                              max_pages=20, max_bytes=2048, max_total_bytes=4096,
                              max_seconds=30, dry_run=False)

    def mocked_fetch(self, url, limit, deadline):
        return (b"User-agent: *\nAllow: /\n", "text/plain") if url.endswith("/robots.txt") else (self.body, "text/plain")

    def test_html_utf8_and_normalization(self):
        raw = b"<head>hidden</head><nav>menu</nav><p>Hello &amp; world</p><script>bad</script><style>bad</style>"
        text = web.extract(raw, "text/html")
        self.assertIn("Hello & world", text)
        for hidden in ["hidden", "menu", "bad"]:
            self.assertNotIn(hidden, text)
        self.assertEqual(web.normalize("CAT!  cat", set("cat ")), "cat cat")
        with self.assertRaises(UnicodeDecodeError):
            web.extract(b"\xff", "text/plain")
        with self.assertRaises(ValueError):
            web.extract(b"text", "application/json")

    def test_exact_and_near_duplicates(self):
        first = " ".join("word" + str(i) for i in range(100))
        prior = [(first, web.shingles(first))]
        self.assertTrue(web.duplicate(first, prior))
        self.assertTrue(web.duplicate(first + " extra", prior))
        self.assertFalse(web.duplicate("a different document with unrelated words", prior))
        self.assertEqual(web.split_for(first), web.split_for(first))

    def test_invalid_allowlist(self):
        for key, value in [("url", "http://example.org/x"), ("url", "https://user:pass@example.org/x"),
                           ("sha256", "missing"), ("license", ""), ("license_url", "ftp://example.org")]:
            bad = {**self.source, key: value}
            self.allow.write_text(json.dumps({"sources": [bad]}))
            with self.assertRaises(ValueError):
                web.load_allowlist(self.allow, 20)
        self.allow.write_text(json.dumps({"sources": [self.source, self.source]}))
        with self.assertRaises(ValueError):
            web.load_allowlist(self.allow, 20)

    def test_dry_run_no_network_or_writes(self):
        self.args.dry_run = True
        with patch.object(web, "fetch", side_effect=AssertionError("network")):
            result = web.prepare(self.args)
        self.assertEqual(result["network_requests"], 0)
        self.assertFalse(self.args.output.exists())

    def test_prepare_hashes_provenance_and_exclusive_output(self):
        with patch.object(web, "fetch", side_effect=self.mocked_fetch):
            record = web.prepare(self.args)
        raw = (self.args.output / "documents.jsonl").read_bytes()
        doc = json.loads(raw)
        self.assertEqual(record["documents_sha256"], web.sha(raw))
        self.assertEqual(sum(record["split_counts"].values()), 1)
        self.assertTrue(record["warnings"])
        self.sleep.assert_called()
        self.assertEqual(doc["source"], self.source)
        self.assertEqual(doc["text_sha256"], web.sha(doc["text"].encode()))
        self.assertEqual(doc["split"], web.split_for(doc["text"]))
        with patch.object(web, "fetch", side_effect=AssertionError("must reject before network")):
            with self.assertRaises(ValueError):
                web.prepare(self.args)

    def test_denied_malformed_paced_robots_and_hash_mismatch(self):
        for policy in [b"User-agent: *\nDisallow: /", b"garbage", b"User-agent: other\nAllow: /",
                       b"User-agent: *\nAllow: /\nCrawl-delay: 2"]:
            with patch.object(web, "fetch", return_value=(policy, "text/plain")):
                with self.assertRaises(ValueError):
                    web.prepare(self.args)
            self.assertFalse(self.args.output.exists())
        self.source["sha256"] = "0" * 64
        self.allow.write_text(json.dumps({"sources": [self.source]}))
        with patch.object(web, "fetch", side_effect=self.mocked_fetch):
            with self.assertRaises(ValueError):
                web.prepare(self.args)
        self.assertFalse(self.args.output.exists())

    def test_exclusion_before_split(self):
        self.exclude.write_text(json.dumps({"text": self.body.decode()}) + "\n")
        with patch.object(web, "fetch", side_effect=self.mocked_fetch):
            with self.assertRaisesRegex(ValueError, "No eligible"):
                web.prepare(self.args)
        self.assertFalse(self.args.output.exists())

    def test_duplicate_sources_removed_before_assignment(self):
        second = {**self.source, "url": "https://example.org/second.txt"}
        self.allow.write_text(json.dumps({"sources": [second, self.source]}))
        with patch.object(web, "fetch", side_effect=self.mocked_fetch):
            record = web.prepare(self.args)
        self.assertEqual(record["documents"], 1)
        self.assertEqual(record["rejected"], [{"url": self.source["url"], "reason": "duplicate"}])

    def test_page_cap_network_failure_and_exclusion_cap(self):
        self.allow.write_text(json.dumps({"sources": [self.source, {**self.source, "url": "https://example.org/other"}]}))
        with self.assertRaises(ValueError):
            web.load_allowlist(self.allow, 1)
        self.allow.write_text(json.dumps({"sources": [self.source]}))
        with patch.object(web, "fetch", side_effect=OSError("robots unavailable")):
            with self.assertRaises(OSError):
                web.prepare(self.args)
        self.assertFalse(self.args.output.exists())
        self.exclude.write_text("x" * 4097)
        with self.assertRaisesRegex(ValueError, "Exclusion"):
            web.prepare(self.args)

    def test_fetch_bounds_deadline_and_redirect(self):
        headers = Message()
        headers["Content-Type"] = "text/plain"
        class Response(io.BytesIO):
            status = 200
            def geturl(self):
                return "https://example.org/story.txt"
        response = Response(b"abcdef")
        response.headers = headers
        with patch.object(web.request, "build_opener") as build:
            build.return_value.open.return_value = response
            with self.assertRaisesRegex(ValueError, "byte budget"):
                web.fetch(self.source["url"], 3, time.monotonic()+10)
        with self.assertRaisesRegex(ValueError, "time budget"):
            web.fetch(self.source["url"], 3, time.monotonic()-1)
        with self.assertRaisesRegex(ValueError, "Redirects"):
            web.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.org/other")


if __name__ == "__main__":
    unittest.main()
