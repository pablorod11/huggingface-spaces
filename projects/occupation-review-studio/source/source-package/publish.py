"""Publish the reviewed model and Gradio Space using an existing local HF login."""
import argparse
import hashlib
import json
from pathlib import Path

OWNER = 'PabloRod11'
ROOT = Path(__file__).resolve().parent
IGNORE = ['__pycache__/**', '**/__pycache__/**', '*.pyc', '**/*.pyc', '.venv/**',
          'data/raw/**', '*.sqlite*', '**/*.sqlite*', '*.feedback.csv', '.env', '.git/**']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--update', action='store_true', help='Explicitly permit updating existing target repos')
    args = parser.parse_args()
    model = ROOT / 'model'
    required = [model / name for name in ['model.json', 'README.md', 'metrics.json', 'training_metadata.json']]
    if not all(path.is_file() for path in required):
        raise SystemExit('Build and review the model package first.')
    metadata = json.loads((model / 'training_metadata.json').read_text())
    if hashlib.sha256((model / 'model.json').read_bytes()).hexdigest() != metadata['model_sha256']:
        raise SystemExit('Model hash does not match training metadata.')
    targets = [('model', f'{OWNER}/occupation-hitl-classifier', model),
               ('space', f'{OWNER}/occupation-review-studio', ROOT)]
    print(json.dumps({'targets': [{'type': kind, 'repo': repo} for kind, repo, _ in targets],
                      'model_sha256': metadata['model_sha256'], 'ignore_patterns': IGNORE}, indent=2))
    if args.dry_run:
        return
    from huggingface_hub import HfApi, get_token
    if not get_token():
        raise SystemExit('No Hugging Face login. Run hf auth login locally; never put tokens in files or chat.')
    api = HfApi()
    if api.whoami()['name'].lower() != OWNER.lower():
        raise SystemExit(f'Authenticate as {OWNER} before publishing.')
    # Check both destinations before creating either repo.
    for kind, repo, _ in targets:
        if api.repo_exists(repo_id=repo, repo_type=kind) and not args.update:
            raise SystemExit(f'{repo} already exists. Review it and use --update explicitly if intended.')
    for kind, repo, folder in targets:
        options = {'space_sdk': 'gradio'} if kind == 'space' else {}
        api.create_repo(repo_id=repo, repo_type=kind, exist_ok=args.update, private=False, **options)
        result = api.upload_folder(repo_id=repo, repo_type=kind, folder_path=folder,
                                   ignore_patterns=IGNORE, commit_message='Release evaluated occupation model and review case study')
        print(f'{kind}: https://huggingface.co/{"spaces/" if kind == "space" else ""}{repo}')
        print('Commit:', result.oid)


if __name__ == '__main__':
    main()
