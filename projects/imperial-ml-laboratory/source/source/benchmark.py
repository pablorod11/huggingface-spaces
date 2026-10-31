"""Measure actual local one/two-worker wall and training times."""
import argparse
import json
from pathlib import Path
import socket
import statistics
import subprocess
import sys
import tempfile
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=12)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--global-batch-size', type=int, default=128)
    parser.add_argument('--output', type=Path, default=Path('artifacts/benchmark.json'))
    args = parser.parse_args()
    if args.epochs < 1 or args.repeats < 1:
        parser.error('epochs and repeats must be positive')
    if args.global_batch_size < 2 or args.global_batch_size % 2:
        parser.error('global batch size must be positive and divisible by two')
    runs = []
    with tempfile.TemporaryDirectory() as directory:
        for repeat in range(args.repeats):
            # Alternate order to reduce simple warm-cache/order bias.
            for workers in ([1, 2] if repeat % 2 == 0 else [2, 1]):
                with socket.socket() as listener:
                    listener.bind(('127.0.0.1', 0))
                    port = listener.getsockname()[1]
                metrics = Path(directory) / f'{repeat}-{workers}.json'
                started = time.perf_counter()
                result = subprocess.run(
                    [sys.executable, '-m', 'torch.distributed.run', '--nnodes=1',
                     f'--nproc-per-node={workers}', '--master-addr=127.0.0.1',
                     f'--master-port={port}', 'train.py', '--epochs', str(args.epochs),
                     '--checkpoint', str(metrics.with_suffix('.pt')), '--metrics', str(metrics),
                     '--global-batch-size', str(args.global_batch_size)],
                    cwd=Path(__file__).parent, capture_output=True, text=True, timeout=300)
                wall_seconds = time.perf_counter() - started
                if result.returncode:
                    raise RuntimeError(result.stdout + result.stderr)
                report = json.loads(metrics.read_text())
                runs.append({'workers': workers, 'repeat': repeat + 1, 'wall_seconds': wall_seconds,
                             'train_seconds': report['total_train_seconds'],
                             'accuracy': report['evaluation']['accuracy'],
                             'global_batch_size': report['training']['global_batch_size'],
                             'optimizer_steps_per_epoch': report['training']['optimizer_steps_per_epoch']})
    medians = {str(workers): {key: statistics.median(row[key] for row in runs if row['workers'] == workers)
                             for key in ['wall_seconds', 'train_seconds', 'accuracy']}
               for workers in [1, 2]}
    report = {'runs': runs, 'medians': medians,
              'wall_speedup': medians['1']['wall_seconds'] / medians['2']['wall_seconds'],
              'train_speedup': medians['1']['train_seconds'] / medians['2']['train_seconds'],
              'notes': 'Measured on this host; this small workload can be slower with two workers. '
                       'Wall includes startup, data loading, evaluation and checkpoint writes. '
                       'Training sums epoch maximum worker times. Global batch size, padded sample work '
                       'and optimizer steps are held equal; floating-point reduction order can differ.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
