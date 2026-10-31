"""Package only the reproducible project source and public Space assets."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPACE = ROOT / 'space'


def main() -> None:
    files = set()
    for folder in ['src', 'config', 'data_loader', 'scripts', 'tests']:
        files.update((ROOT / folder).rglob('*.py'))
    files.update((ROOT / 'configs').rglob('*.json'))
    files.update((ROOT / 'tests/browser').rglob('*.cjs'))
    files.update((ROOT / 'tests/browser').rglob('*.png'))
    files.update((ROOT / '.github/workflows').glob('*.yml'))
    files.update(ROOT / 'data/story_corpus' / name for name in ['train.txt', 'val.txt', 'test.txt'])
    files.update(ROOT / 'data/story_corpus' / name for name in ['manifest.json', 'README.md'])
    files.update(ROOT / 'models/story-initial' / name for name in ['model.json', 'training.json', 'checkpoint.pt'])
    files.update((ROOT / '.codex').rglob('*.toml'))
    files.update((ROOT / '.codex').glob('*.md'))
    files.update(ROOT / name for name in [
        '.gitignore', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'CAMPAIGN.md', 'AGENTS.md',
        'DESIGN.md', 'BROWSER_CHECKS.md', 'WEB_CORPUS.md', 'REFINEMENT.md', 'VERIFICATION.json', 'experiments/lifecycle-smoke.json', 'pyproject.toml', 'package.json', 'package-lock.json', 'playwright.config.cjs', 'data/space_corpus.txt',
    ])
    files.update(p for p in SPACE.iterdir() if p.is_file() and p.name != 'source.zip')
    target = SPACE / 'source.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, Path('imperial-llm') / path.relative_to(ROOT))
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert not any('/.git/' in name or '__pycache__' in name or '.venv' in name for name in archive.namelist())
    print(f'Packaged {len(files)} files; archive integrity passed.')


if __name__ == '__main__':
    main()
