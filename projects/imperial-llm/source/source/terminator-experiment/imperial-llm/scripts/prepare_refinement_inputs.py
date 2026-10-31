"""Restore only required inputs from the pinned public Imperial source archive."""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://huggingface.co/spaces/PabloRod11/imperial-llm/resolve/3185cd49f7abccc7ad2b30c4b73b04672415da76/source.zip'
SHA256 = '63d04ef04fd7c00815cb872729dbb26c18001a3cbf4533c5fdf9d723fd2f1c75'
FILES = [
    'data/expanded_story_corpus/manifest.json',
    'data/expanded_story_corpus/train.txt',
    'data/expanded_story_corpus/val.txt',
    'data/budget_story_test/manifest.json',
    'data/wide_budget_story_test/manifest.json',
    'data/wide_budget_story_test/stories.json',
    'experiments/wide-budget-extension/checkpoint.pt',
]


def restore(raw, root):
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError('Pinned source archive checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in FILES:
            content = archive.read('work/terminator-experiment/imperial-llm/' + name)
            target = root / name
            if target.exists() and target.read_bytes() != content:
                raise ValueError('Refuse to replace differing input: ' + name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    print('Verified pinned archive and restored seven explicit input files.')


if __name__ == '__main__':
    with urllib.request.urlopen(URL, timeout=60) as response:
        raw = response.read(30_000_001)
    if len(raw) > 30_000_000:
        raise ValueError('Archive exceeds expected size bound')
    restore(raw, Path.cwd())
