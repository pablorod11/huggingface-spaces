"""Export an explicitly selected, completed run to a reproducible static demo."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import zipfile

import torch
from model import build_model, load_splits

BASE = Path(__file__).resolve().parent


def read_json(path):
    return json.loads(path.read_text())


def export(run_directory, output):
    run_directory, output = run_directory.resolve(), output.resolve()
    if output == BASE or BASE in output.parents:
        raise ValueError('output must be outside the source directory')
    status = read_json(run_directory / 'status.json')
    if status.get('status') != 'completed':
        raise ValueError('only completed runs can be exported')
    payload = (run_directory / 'checkpoint.pt').read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != status.get('checkpoint_sha256'):
        raise ValueError('checkpoint digest does not match completed run record')
    checkpoint = torch.load(io.BytesIO(payload), map_location='cpu', weights_only=True)
    if (checkpoint.get('schema_version') != 2 or checkpoint.get('dataset', {}).get('split_version') != 2
            or 'selected_state_dict' not in checkpoint):
        raise ValueError('export requires the validation-selected model and split version 2')
    measured = read_json(run_directory / 'metrics.json')
    if (measured.get('dataset') != checkpoint['dataset'] or measured.get('history') != checkpoint['metrics']
            or measured.get('evaluation', {}).get('split') != 'test'
            or measured['evaluation'].get('selected_epoch') != checkpoint['best_epoch']):
        raise ValueError('metrics do not describe this checkpoint and test evaluation')
    model = build_model()
    model.load_state_dict(checkpoint['selected_state_dict'], strict=True)
    model.eval()
    if any(not torch.isfinite(p).all() for p in model.parameters()):
        raise ValueError('non-finite selected model weights')
    test_x, test_y = load_splits()[4:]
    generator = torch.Generator().manual_seed(2026)
    inputs = torch.cat([test_x[:40], torch.zeros(1, 64), torch.ones(1, 64),
                        (torch.arange(64) % 2).float().reshape(1, 64),
                        torch.eye(64), torch.rand(64, 64, generator=generator)])
    with torch.inference_mode():
        expected = torch.softmax(model(inputs), dim=1)
    data = {
        'model': {k: v.tolist() for k, v in model.state_dict().items()},
        'model_version': digest, 'run_id': status['id'],
        **{key: measured[key] for key in ['history', 'dataset', 'training', 'evaluation']},
        'benchmark': read_json(BASE / 'evidence' / 'benchmark.json'),
        'verification': read_json(BASE / 'evidence' / 'verification.json'),
        'samples': [{'id': i, 'pixels': test_x[i].tolist(), 'label': int(test_y[i])}
                    for i in range(min(40, len(test_x)))],
        'parity': {'inputs': inputs.tolist(), 'expected': expected.tolist(),
                   'tolerance': 1e-6, 'seed': 2026},
    }
    # Validate the complete input set before writing any deliverable.
    template = BASE / 'public'
    for name in ['index.html', 'styles.css', 'app.js']:
        if not (template / name).is_file():
            raise FileNotFoundError(f'public template missing {name}')
    output.mkdir(parents=True, exist_ok=True)
    for name in ['index.html', 'styles.css', 'app.js']:
        shutil.copyfile(template / name, output / name)
    (output / 'showcase.json').write_text(json.dumps(data, allow_nan=False, separators=(',', ':')))
    (output / 'README.md').write_text('''---
title: Imperial ML Laboratory
emoji: 🧠
colorFrom: blue
colorTo: green
sdk: static
app_file: index.html
---

# Imperial ML Laboratory

Browser inference uses actual validation-selected PyTorch weights. Curves, final test evaluation and benchmark timings are recorded local evidence. The checkpoint SHA-256 identifies the complete source artifact; browser inference uses its selected model tensors. Training and promotion run in the downloadable local source, not in this Static Space.

See source.zip for the exporter, training/tests, model methodology and runtime limitations. The exporter includes sample, random and boundary probability vectors for independent JavaScript parity verification. This static site does not establish supported Linux/Docker or multi-node execution.
''')
    excluded = {'__pycache__', '.venv', '.git', 'artifacts', 'reference', 'work', 'build', 'dist'}
    with zipfile.ZipFile(output / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(BASE.rglob('*')):
            relative = path.relative_to(BASE)
            if (path.is_file() and not any(part in excluded or part.endswith('.egg-info') for part in relative.parts)
                    and path.suffix not in {'.pyc', '.pt', '.zip'}):
                archive.write(path, arcname=str(Path(BASE.name) / relative))
    manifest = {'run_id': status['id'], 'checkpoint_sha256': digest,
                'selection': 'selected_state_dict', 'split_version': 2,
                'files': {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                          for name in ['index.html', 'styles.css', 'app.js', 'showcase.json', 'source.zip']}}
    (output / 'export-manifest.json').write_text(json.dumps(manifest, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(export(args.run_dir, args.output), indent=2))


if __name__ == '__main__':
    main()
