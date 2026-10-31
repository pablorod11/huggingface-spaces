"""Recoverable CPU DDP digits classification; launch with torchrun."""
import argparse
import copy
from datetime import timedelta
import json
import os
from pathlib import Path
import tempfile
import time

import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel
from torch.utils.data import DataLoader, TensorDataset
from model import build_model, load_splits
from evaluation import evaluate


def atomic_save(payload, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as output:
            torch.save(payload, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def publish_metrics(history, training, dataset, path, evaluation=None):
    report = {'history': history, 'training': training, 'dataset': dataset,
              'total_train_seconds': sum(row['train_seconds'] for row in history)}
    if evaluation is not None:
        report['evaluation'] = evaluation
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(report, output, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=12)
    parser.add_argument('--global-batch-size', type=int, default=128)
    parser.add_argument('--checkpoint', type=Path, default=Path('artifacts/model.pt'))
    parser.add_argument('--metrics', type=Path, default=Path('artifacts/metrics.json'))
    parser.add_argument('--resume', type=Path)
    parser.add_argument('--fail-once-rank1-at-epoch', type=int)
    args = parser.parse_args()
    world = int(os.environ['WORLD_SIZE'])
    if args.global_batch_size < world or args.global_batch_size % world:
        parser.error('global batch size must be positive and divisible by worker count')
    if args.epochs < 1 or (args.fail_once_rank1_at_epoch is not None and
                         (world < 2 or not 1 <= args.fail_once_rank1_at_epoch <= args.epochs)):
        parser.error('positive epochs required; failure injection needs two workers and a valid epoch')
    torch.set_num_threads(1)
    torch.manual_seed(42)
    torch.use_deterministic_algorithms(True)
    dist.init_process_group('gloo', timeout=timedelta(seconds=120))
    try:
        rank = dist.get_rank()
        train_x, train_y, validation_x, validation_y, test_x, test_y = load_splits()
        padded_samples = ((len(train_x) + args.global_batch_size - 1) // args.global_batch_size
                          * args.global_batch_size)
        dataset_tensors = TensorDataset(train_x, train_y)
        model = DistributedDataParallel(build_model())
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
        history, start_epoch = [], 0
        selected_state = copy.deepcopy(model.module.state_dict())
        best_loss, best_epoch = float('inf'), 0
        resume = args.checkpoint if int(os.environ.get('TORCHELASTIC_RESTART_COUNT', '0')) else args.resume
        if int(os.environ.get('TORCHELASTIC_RESTART_COUNT', '0')) and not args.checkpoint.exists():
            raise FileNotFoundError('elastic restart requires a published checkpoint')
        if resume is not None and resume.exists():
            saved = torch.load(resume, map_location='cpu', weights_only=True)
            if saved.get('schema_version') != 2 or saved['training']['world_size'] != world:
                raise ValueError('resume requires schema 2 and unchanged worker count')
            if (saved['training'].get('global_batch_size') != args.global_batch_size
                    or saved.get('dataset', {}).get('split_version') != 2):
                raise ValueError('resume requires matching global batch and train/validation/test split')
            model.module.load_state_dict(saved['state_dict'])
            optimizer.load_state_dict(saved['optimizer'])
            start_epoch, history = saved['epoch'], saved['metrics']
            selected_state = saved['selected_state_dict']
            best_loss, best_epoch = saved['best_validation_loss'], saved['best_epoch']
            if start_epoch > args.epochs:
                raise ValueError('resume epoch exceeds requested target')
        dataset = {'name': 'sklearn.datasets.load_digits', 'train_samples': len(train_x),
                   'validation_samples': len(validation_x), 'test_samples': len(test_x),
                   'split_version': 2, 'split_seed': 42, 'validation_test_seed': 43,
                   'split_fractions': [0.6, 0.2, 0.2], 'pixel_divisor': 16,
                   'shape': [8, 8], 'classes': 10}
        training = {'world_size': world, 'epochs': args.epochs, 'seed': 42,
                    'restart_count': int(os.environ.get('TORCHELASTIC_RESTART_COUNT', '0')),
                    'backend': 'gloo', 'batch_size_per_rank': args.global_batch_size // world,
                    'global_batch_size': args.global_batch_size,
                    'padded_samples_per_epoch': padded_samples,
                    'optimizer_steps_per_epoch': padded_samples // args.global_batch_size}
        for epoch in range(start_epoch, args.epochs):
            # Same global permutation and padded sample work for all worker counts.
            order = torch.randperm(len(train_x), generator=torch.Generator().manual_seed(42 + epoch)).tolist()
            order = (order * ((padded_samples + len(order) - 1) // len(order)))[:padded_samples]
            loader = DataLoader(dataset_tensors, batch_size=args.global_batch_size // world,
                                sampler=order[rank::world])
            model.train()
            started = time.perf_counter()
            for features, labels in loader:
                optimizer.zero_grad()
                loss = torch.nn.functional.cross_entropy(model(features), labels)
                loss.backward()
                optimizer.step()
            elapsed = torch.tensor(time.perf_counter() - started)
            dist.all_reduce(elapsed, op=dist.ReduceOp.MAX)
            model.eval()
            with torch.inference_mode():
                train_loss = torch.nn.functional.cross_entropy(model.module(train_x), train_y).item()
                logits = model.module(validation_x)
                validation_loss = torch.nn.functional.cross_entropy(logits, validation_y).item()
                accuracy = (logits.argmax(1) == validation_y).float().mean().item()
            if not all(torch.isfinite(torch.tensor(v)) for v in [train_loss, validation_loss, accuracy]):
                raise RuntimeError('non-finite training metrics')
            if validation_loss < best_loss:
                best_loss, best_epoch = validation_loss, epoch + 1
                selected_state = copy.deepcopy(model.module.state_dict())
            history.append({'epoch': epoch + 1, 'train_loss': train_loss,
                            'validation_loss': validation_loss, 'validation_accuracy': accuracy,
                            'accuracy': accuracy, 'train_seconds': elapsed.item()})
            dist.barrier()
            if rank == 0:
                atomic_save({'schema_version': 2, 'input_dim': 64, 'classes': 10,
                             'state_dict': model.module.state_dict(), 'optimizer': optimizer.state_dict(),
                             'epoch': epoch + 1, 'metrics': history, 'training': training,
                             'selected_state_dict': selected_state, 'best_epoch': best_epoch,
                             'best_validation_loss': best_loss,
                             'dataset': dataset}, args.checkpoint)
                publish_metrics(history, training, dataset, args.metrics)
            dist.barrier()
            if rank == 1 and args.fail_once_rank1_at_epoch == epoch + 1:
                marker = args.checkpoint.with_suffix('.failure-injected')
                if not marker.exists():
                    with marker.open('x') as output:
                        output.write(str(epoch + 1))
                        output.flush()
                        os.fsync(output.fileno())
                    os._exit(17)
            dist.barrier()
        if rank == 0:
            selected_model = build_model()
            selected_model.load_state_dict(selected_state)
            evaluation = evaluate(selected_model, test_x, test_y)
            evaluation['selected_epoch'] = best_epoch
            report = publish_metrics(history, training, dataset, args.metrics, evaluation)
            print(json.dumps(report))
        dist.barrier()
    finally:
        dist.destroy_process_group()


if __name__ == '__main__':
    main()
