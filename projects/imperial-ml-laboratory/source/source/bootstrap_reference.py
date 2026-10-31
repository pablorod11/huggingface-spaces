"""Build an actual one-worker reference run for the inference-only image."""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('/app/reference'))
    root = parser.parse_args().output.resolve()
    run_id = '00000000000000000000000000000001'
    directory = root / 'runs' / run_id
    directory.mkdir(parents=True, exist_ok=True)
    checkpoint = directory / 'checkpoint.pt'
    created_at = datetime.now(timezone.utc).isoformat()
    with (directory / 'train.log').open('w') as log:
        subprocess.run(
            [sys.executable, '-m', 'torch.distributed.run', '--nnodes=1',
             '--nproc-per-node=1', '--master-addr=127.0.0.1', '--master-port=29500',
             'train.py', '--epochs', '12', '--checkpoint', str(checkpoint),
             '--metrics', str(directory / 'metrics.json')],
            check=True, stdout=log, stderr=subprocess.STDOUT, timeout=600,
        )
    measured = json.loads((directory / 'metrics.json').read_text())
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    status = {
        'id': run_id, 'status': 'completed', 'epochs': measured['training']['epochs'],
        'workers': measured['training']['world_size'], 'inject_failure': False,
        'created_at': created_at, 'updated_at': datetime.now(timezone.utc).isoformat(),
        'checkpoint_sha256': digest,
    }
    (directory / 'status.json').write_text(json.dumps(status, indent=2))
    (root / 'active-model.json').write_text(json.dumps({
        'run_id': run_id, 'model_version': digest, 'checkpoint': str(checkpoint),
    }, indent=2))


if __name__ == '__main__':
    main()
