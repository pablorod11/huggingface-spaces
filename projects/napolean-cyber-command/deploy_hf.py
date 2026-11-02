"""Publish allowlisted source to a NEW private, no-compute Hugging Face Static Space."""
import argparse
from pathlib import Path
import re
import sys

SOURCE_FILES=(
    'README.md','index.html','static/index.html','static/style.css','static/app.js',
    'static/local.js','static/playbooks.js','static/logo.svg','static/logo-print.svg',
    'static/favicon.svg','tests/test_local.cjs',
    'tests/browser_storage.cjs','tests/browser_ui.cjs','tests/browser_engagement.cjs',
    'tests/legacy-snapshot.json','tests/detection-fixtures.cjs',
    'SECURITY.md','SERVICE.md','PROVENANCE.md','VERIFICATION.md','IMPROVEMENTS.md',
)

def validate_repo_id(repo_id):
    if not isinstance(repo_id,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,95}/[A-Za-z0-9][A-Za-z0-9_-]{0,95}',repo_id):
        raise ValueError('Use account-or-organization/project-name.')

def collect_files(root):
    root=Path(root).resolve()
    for name in SOURCE_FILES:
        path=root/name
        if not path.is_file() or path.is_symlink() or any(p.is_symlink() for p in path.parents if p!=root and root in p.parents):
            raise ValueError(f'Missing or symlinked source: {name}')
        if not path.resolve().is_relative_to(root) or path.stat().st_size>2_000_000:
            raise ValueError(f'Invalid or oversized source: {name}')
    return list(SOURCE_FILES)

def deploy(api,repo_id,root):
    validate_repo_id(repo_id)
    root=Path(root).resolve()
    files=collect_files(root)
    api.create_repo(repo_id=repo_id,repo_type='space',space_sdk='static',private=True,exist_ok=False)
    api.upload_folder(repo_id=repo_id,repo_type='space',folder_path=str(root),allow_patterns=files,
                      commit_message='Add no-cost browser security workbench')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-id',required=True)
    args=parser.parse_args()
    validate_repo_id(args.repo_id)
    try:
        from huggingface_hub import HfApi,get_token
    except ImportError:
        parser.error('Install requirements-deploy.txt first (optional publishing tool only).')
    token=get_token()
    if not token:parser.error('Authenticate locally with hf auth login; never paste tokens into chat.')
    try:deploy(HfApi(token=token),args.repo_id,Path(__file__).resolve().parent)
    except ValueError as exc:parser.error(str(exc))
    except Exception as exc:
        print(f'Upload incomplete ({type(exc).__name__}). Inspect the private repository; partial source may exist. Nothing was deleted.',file=sys.stderr)
        return 1
    print(f'Static source uploaded: https://huggingface.co/spaces/{args.repo_id}')
    print('No compute, paid hardware, model API or application secrets were requested. Verify the hosted app before sharing.')
    return 0

if __name__=='__main__':raise SystemExit(main())
