"""Bounded, explicit-source corpus preparation. Never trains or promotes a model."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib import request, robotparser
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "ImperialCorpusBot/1.0"
MAX_BYTES = 2 * 1024 * 1024


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def https(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("Expected HTTPS URL without credentials or fragment")
    return parsed


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirects are forbidden")


def fetch(url, limit, deadline):
    https(url)
    if limit < 0:
        raise ValueError("Aggregate byte budget exceeded")
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError("Total time budget exceeded")
    opener = request.build_opener(NoRedirect())
    req = request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    with opener.open(req, timeout=min(10, remaining)) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError("Only HTTP 200 at the exact requested URL is accepted")
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise ValueError("Compressed responses are unsupported")
        chunks, size = [], 0
        while True:
            if time.monotonic() >= deadline:
                raise ValueError("Total time budget exceeded")
            chunk = response.read1(min(65536, limit + 1 - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
            if size > limit:
                raise ValueError("Response exceeds byte budget")
        if time.monotonic() >= deadline:
            raise ValueError("Total time budget exceeded")
        return b"".join(chunks), response.headers.get_content_type()


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden, self.parts = [], []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "nav", "noscript", "template", "head"}:
            self.hidden.append(tag)
        if not self.hidden and tag in {"p", "br", "div", "li", "h1", "h2", "h3"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in self.hidden:
            self.hidden = self.hidden[:self.hidden.index(tag)]
        if not self.hidden:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def extract(raw, content_type):
    text = raw.decode("utf-8-sig", errors="strict")
    if content_type == "text/html":
        parser = VisibleText()
        parser.feed(text)
        parser.close()
        return "".join(parser.parts)
    if content_type != "text/plain":
        raise ValueError("Only UTF-8 text/plain and text/html are supported")
    return text


def normalize(text, vocab):
    text = text.replace("’", "'")
    text = "".join(c if c in vocab else c.lower() if c.lower() in vocab else " " for c in text)
    return " ".join(text.split())


def shingles(text):
    words = text.lower().split()
    return {tuple(words[i:i+5]) for i in range(len(words)-4)}


def duplicate(text, prior):
    signature = shingles(text)
    # ponytail: bounded quadratic comparisons; use an index if document caps grow.
    for old_text, old_signature in prior:
        if text == old_text:
            return True
        union = signature | old_signature
        if union and len(signature & old_signature) / len(union) >= 0.8:
            return True
    return False


def split_for(text):
    bucket = int(sha(text.encode())[:8], 16) % 100
    return "train" if bucket < 80 else "val" if bucket < 90 else "test"


def load_allowlist(path, max_pages):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Allowlist too large")
    sources = json.loads(path.read_text())["sources"]
    if not isinstance(sources, list) or not 1 <= len(sources) <= max_pages:
        raise ValueError("Allowlist must contain 1..max-pages sources")
    seen = set()
    for source in sources:
        for key in ("url", "license", "license_url", "attribution", "sha256"):
            if not isinstance(source.get(key), str) or not source[key].strip():
                raise ValueError("Missing nonempty source field: " + key)
        https(source["url"])
        https(source["license_url"])
        if not re.fullmatch(r"[0-9a-f]{64}", source["sha256"]):
            raise ValueError("Expected lowercase SHA-256")
        if source["url"] in seen:
            raise ValueError("Duplicate source URL")
        seen.add(source["url"])
    return sorted(sources, key=lambda source: source["url"])


def prepare(args):
    if args.output.exists():
        raise ValueError("Output path already exists")
    sources = load_allowlist(args.allowlist, args.max_pages)
    model_path = ROOT / "space/model.json"
    vocab = set(json.loads(model_path.read_text())["vocab"])
    prior, exclusions, exclusion_bytes = [], [], 0
    for path in args.exclude:
        exclusion_bytes += path.stat().st_size
        if exclusion_bytes > args.max_total_bytes:
            raise ValueError("Exclusion file exceeds byte limit")
        raw = path.read_bytes()
        exclusions.append({"path": str(path), "sha256": sha(raw)})
        for line in raw.decode("utf-8").splitlines():
            text = normalize(json.loads(line)["text"], vocab)
            prior.append((text, shingles(text)))
            if len(prior) > 5000:
                raise ValueError("At most 5000 exclusion documents")
    if args.dry_run:
        return {"dry_run": True, "sources": sources, "exclusion_files": exclusions,
                "network_requests": 0, "output_written": False}
    deadline, downloaded = time.monotonic() + args.max_seconds, 0
    documents, rejected = [], []
    robots, last_request = {}, {}
    def polite_fetch(url, limit):
        origin = urlsplit(url).netloc
        wait = max(0, last_request.get(origin, 0) + 1 - time.monotonic())
        if time.monotonic() + wait >= deadline:
            raise ValueError("Insufficient time budget for per-origin pacing")
        if wait:
            time.sleep(wait)
        result = fetch(url, limit, deadline)
        last_request[origin] = time.monotonic()
        return result
    for source in sources:
        parsed = https(source["url"])
        origin = parsed.scheme + "://" + parsed.netloc
        if origin not in robots:
            raw, kind = polite_fetch(origin + "/robots.txt", min(65536, args.max_total_bytes-downloaded))
            downloaded += len(raw)
            if kind != "text/plain":
                raise ValueError("robots.txt must be UTF-8 text/plain")
            policy = robotparser.RobotFileParser()
            lines = raw.decode("utf-8", errors="strict").splitlines()
            if not any(re.match(r"(?i)^\s*user-agent\s*:", line) for line in lines) or not any(re.match(r"(?i)^\s*(allow|disallow)\s*:", line) for line in lines):
                raise ValueError("robots.txt lacks explicit recognizable rules")
            policy.parse(lines)
            if not (policy.default_entry or any("*" in entry.useragents or entry.applies_to(USER_AGENT) for entry in policy.entries)):
                raise ValueError("robots.txt has no applicable user-agent rules")
            if policy.crawl_delay(USER_AGENT) or policy.request_rate(USER_AGENT):
                raise ValueError("robots.txt pacing directives unsupported; source rejected")
            robots[origin] = policy
        if not robots[origin].can_fetch(USER_AGENT, source["url"]):
            raise ValueError("robots.txt denies source: " + source["url"])
        raw, kind = polite_fetch(source["url"], min(args.max_bytes, args.max_total_bytes-downloaded))
        downloaded += len(raw)
        if sha(raw) != source["sha256"]:
            raise ValueError("Source SHA-256 mismatch: " + source["url"])
        text = normalize(extract(raw, kind), vocab)
        reason = "short" if len(text) < 128 else "duplicate" if duplicate(text, prior) else None
        if reason:
            rejected.append({"url": source["url"], "reason": reason})
            continue
        prior.append((text, shingles(text)))
        documents.append({"text": text, "split": split_for(text), "text_sha256": sha(text.encode()),
                          "source": source, "content_type": kind})
    if not documents:
        raise ValueError("No eligible documents; output was not created")
    manifest = {"schema_version": 1, "sources": sources, "documents": len(documents),
                "downloaded_bytes_including_robots": downloaded, "rejected": rejected,
                "exclusion_files": exclusions, "vocab_model_sha256": sha(model_path.read_bytes()),
                "split_method": "SHA256(normalized document) first 8 hex digits modulo100: train<80, val<90, else test",
                "deduplication": "Exact normalized text; 5-word-shingle Jaccard >=0.8 against exclusions and earlier URL-sorted documents, before splitting",
                "limitations": "Metadata asserts approval/license; not verified. Exclusion coverage supplied by operator; near duplicate detection is heuristic. No training or promotion."}
    manifest["split_counts"] = {name: sum(doc["split"] == name for doc in documents) for name in ["train", "val", "test"]}
    manifest["warnings"] = (["Empty split(s): candidate is not ready for training/evaluation"]
                            if not all(manifest["split_counts"].values()) else [])
    args.output.mkdir(parents=True, exist_ok=False)
    lines = "".join(json.dumps(doc, ensure_ascii=False) + "\n" for doc in documents)
    (args.output / "documents.jsonl").write_text(lines)
    manifest["documents_sha256"] = sha(lines.encode())
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allowlist", type=Path, required=True)
    parser.add_argument("--exclude", type=Path, action="append", required=True, help="JSONL whole documents with text field; repeatable")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    for name, default in [("max-pages", 20), ("max-bytes", MAX_BYTES), ("max-total-bytes", 10*MAX_BYTES), ("max-seconds", 120)]:
        parser.add_argument("--" + name, type=int, default=default)
    args = parser.parse_args()
    if not (1 <= args.max_pages <= 100 and 1 <= args.max_bytes <= MAX_BYTES and 1 <= args.max_total_bytes <= 20*MAX_BYTES and 1 <= args.max_seconds <= 300):
        parser.error("Limits: pages1..100, bytes1..2097152, total1..41943040, seconds1..300")
    print(json.dumps(prepare(args), indent=2))


if __name__ == "__main__":
    main()
