"""Behavior tests; two-worker recovery requires permitted loopback sockets."""
import hashlib
import os
from pathlib import Path
import subprocess
import socket
import sys
import tempfile
import time
import threading
import unittest
from unittest.mock import patch, MagicMock
import torch
from fastapi.testclient import TestClient
from model import build_model
from serve import app, atomic_json, load_checkpoint

class ApiTest(unittest.TestCase):
    def test_promotion_prediction_restore_and_controls(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            env = {"DEMO_RUNS_DIR": str(root / 'runs'), "DEMO_ACTIVE_MODEL": str(root / 'active.json'), 'DEMO_READ_ONLY': 'false', 'MODEL_CHECKPOINT': ''}
            run_id = 'a' * 32
            checkpoint = root / 'runs' / run_id / 'checkpoint.pt'
            checkpoint.parent.mkdir(parents=True)
            torch.save({'schema_version': 2, 'input_dim': 64, 'classes': 10, 'selected_state_dict': build_model().state_dict()}, checkpoint)
            digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
            atomic_json(checkpoint.parent / 'status.json', {'id': run_id, 'status': 'completed', 'checkpoint_sha256': digest})
            with patch.dict(os.environ, env):
                with TestClient(app) as client:
                    self.assertEqual(client.get('/health/ready').status_code, 503)
                    sample = client.get('/api/samples').json()['samples'][0]
                    self.assertEqual(len(sample['pixels']), 64)
                    self.assertEqual(client.post('/predict', json={'pixels': [sample['pixels']]}).status_code, 503)
                    self.assertEqual(client.post('/api/promote', json={'run_id': run_id}).json()['model_version'], digest)
                    predicted = client.post('/predict', json={'pixels': [sample['pixels']]}).json()
                    self.assertEqual(len(predicted['probabilities'][0]), 10)
                    self.assertAlmostEqual(sum(predicted['probabilities'][0]), 1, places=5)
                    self.assertEqual(predicted['model_version'], digest)
                    for invalid in ([], [[0] * 63], [[2] * 64], [[-1] * 64], [[0] * 64] * 129):
                        self.assertEqual(client.post('/predict', json={'pixels': invalid}).status_code, 422)
                    self.assertEqual(client.post('/api/promote', json={'run_id': '../escape'}).status_code, 422)
                    self.assertEqual(client.post('/api/train', json={'epochs': 31}).status_code, 422)
                    self.assertEqual(client.post('/api/train', json={'workers': 3}).status_code, 422)
                    self.assertEqual(client.post('/api/train', json={'epochs': 1, 'workers': 1, 'inject_failure': True}).status_code, 422)
                with TestClient(app) as client:
                    self.assertEqual(client.get('/api/status').json()['active_model']['model_version'], digest)
                    self.assertEqual(client.get('/health/ready').status_code, 200)
            with patch.dict(os.environ, {**env, 'DEMO_READ_ONLY': 'true'}):
                with TestClient(app) as client:
                    self.assertEqual(client.post('/api/train', json={}).status_code, 403)
                    self.assertEqual(client.post('/api/promote', json={'run_id': run_id}).status_code, 403)
            checkpoint.write_bytes(b'corrupt')
            with patch.dict(os.environ, env):
                with self.assertRaises(Exception):
                    with TestClient(app): pass

    def test_rejects_nonfinite_artifact_and_marks_orphan(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = build_model()
            with torch.no_grad(): next(model.parameters()).fill_(float('nan'))
            path = root / 'invalid.pt'
            torch.save({'schema_version': 2, 'input_dim': 64, 'classes': 10, 'selected_state_dict': model.state_dict()}, path)
            with self.assertRaises(ValueError): load_checkpoint(path)
            atomic_json(root / 'runs' / ('b' * 32) / 'status.json', {'id': 'b' * 32, 'status': 'running'})
            with patch.dict(os.environ, {'DEMO_RUNS_DIR': str(root / 'runs'), 'DEMO_ACTIVE_MODEL': str(root / 'pointer.json'), 'MODEL_CHECKPOINT': ''}):
                with TestClient(app) as client:
                    self.assertEqual(client.get('/api/runs').json()['runs'][0]['status'], 'failed')

    def test_corrupt_records_and_artifact_promotion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_id = 'c' * 32
            directory = root / 'runs' / run_id
            directory.mkdir(parents=True)
            (directory / 'status.json').write_text('not-json')
            env = {'DEMO_RUNS_DIR': str(root / 'runs'), 'DEMO_ACTIVE_MODEL': str(root / 'pointer.json'), 'MODEL_CHECKPOINT': '', 'DEMO_READ_ONLY': 'false'}
            with patch.dict(os.environ, env):
                with TestClient(app) as client:
                    self.assertEqual(client.get('/api/runs').status_code, 200)
                    self.assertEqual(client.get('/api/runs').json()['runs'][0]['status'], 'failed')
                    atomic_json(directory / 'status.json', {'id': run_id, 'status': 'completed', 'checkpoint_sha256': 'invalid'})
                    (directory / 'checkpoint.pt').write_bytes(b'broken-pickle')
                    self.assertEqual(client.post('/api/promote', json={'run_id': run_id}).status_code, 409)
                    self.assertIsNone(client.get('/api/status').json()['active_model'])
                    tensors = {k: v.to(torch.int64) for k, v in build_model().state_dict().items()}
                    torch.save({'schema_version': 2, 'input_dim': 64, 'classes': 10, 'selected_state_dict': tensors}, directory / 'checkpoint.pt')
                    self.assertEqual(client.post('/api/promote', json={'run_id': run_id}).status_code, 409)

    def test_shutdown_reaps_owned_process_and_thread(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            launched, stopped = threading.Event(), threading.Event()
            process = MagicMock(pid=999999)
            process.poll.return_value = None
            def wait(timeout=None):
                launched.set()
                if not stopped.wait(timeout): raise subprocess.TimeoutExpired('fake', timeout)
                return -15
            process.wait.side_effect = wait
            env = {'DEMO_RUNS_DIR': str(root / 'runs'), 'DEMO_ACTIVE_MODEL': str(root / 'pointer.json'), 'MODEL_CHECKPOINT': '', 'DEMO_READ_ONLY': 'false'}
            with patch.dict(os.environ, env), patch('serve.reserve_port', return_value=12345), patch('serve.subprocess.Popen', return_value=process), patch('serve.os.killpg', side_effect=lambda *args: stopped.set()):
                with TestClient(app) as client:
                    self.assertEqual(client.post('/api/train', json={}).status_code, 202)
                    self.assertTrue(launched.wait(5))
                    runtime = app.state.runtime
                self.assertTrue(runtime.stopping)
                self.assertFalse(runtime.worker.is_alive())
                self.assertFalse(runtime.busy)
                saved = next((root / 'runs').glob('*/status.json')).read_text()
                self.assertIn('failed', saved)

class SupervisedApiTrainingTest(unittest.TestCase):
    def test_actual_api_training_promotion_and_restart(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            env = {'DEMO_RUNS_DIR': str(root / 'runs'), 'DEMO_ACTIVE_MODEL': str(root / 'pointer.json'), 'MODEL_CHECKPOINT': '', 'DEMO_READ_ONLY': 'false'}
            with patch.dict(os.environ, env):
                with TestClient(app) as client:
                    response = client.post('/api/train', json={'epochs': 4, 'workers': 2, 'inject_failure': True})
                    self.assertEqual(response.status_code, 202, response.text)
                    run_id = response.json()['id']
                    self.assertEqual(client.post('/api/train', json={}).status_code, 409)
                    deadline = time.monotonic() + 240
                    while time.monotonic() < deadline:
                        run = next(r for r in client.get('/api/runs').json()['runs'] if r['id'] == run_id)
                        if run['status'] != 'running': break
                        time.sleep(.1)
                    self.assertEqual(run['status'], 'completed', run)
                    self.assertFalse(client.get('/api/status').json()['training_busy'])
                    active = client.post('/api/promote', json={'run_id': run_id})
                    self.assertEqual(active.status_code, 200, active.text)
                    version = active.json()['model_version']
                    sample = client.get('/api/samples').json()['samples'][0]
                    self.assertEqual(client.post('/predict', json={'pixels': [sample['pixels']]}).json()['model_version'], version)
                with TestClient(app) as client:
                    self.assertEqual(client.get('/health/ready').json()['model_version'], version)
            with patch.dict(os.environ, {**env, 'DEMO_READ_ONLY': 'true'}):
                with TestClient(app) as client:
                    self.assertEqual(client.post('/api/train', json={}).status_code, 403)
                    self.assertEqual(client.post('/api/promote', json={'run_id': run_id}).status_code, 403)

class DistributedRecoveryTest(unittest.TestCase):
    def test_two_workers_recover_and_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            checkpoint = Path(temporary) / 'checkpoint.pt'
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', 0))
                port = listener.getsockname()[1]
            command = [sys.executable, '-m', 'torch.distributed.run', '--nnodes=1', '--nproc-per-node=2', '--master-addr=127.0.0.1', f'--master-port={port}', '--max-restarts=1', 'train.py', '--epochs', '8', '--checkpoint', str(checkpoint), '--metrics', str(Path(temporary) / 'metrics.json'), '--resume', str(checkpoint), '--fail-once-rank1-at-epoch', '2']
            result = subprocess.run(command, cwd=Path(__file__).parent, capture_output=True, text=True, timeout=240)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            saved = torch.load(checkpoint, weights_only=True)
            self.assertEqual(saved['epoch'], 8)
            self.assertEqual(saved['training']['world_size'], 2)
            self.assertEqual(len(saved['metrics']), 8)
            self.assertGreater(saved['metrics'][-1]['validation_accuracy'], 0.8)
            self.assertEqual(saved['best_validation_loss'], min(row['validation_loss'] for row in saved['metrics']))
            for tensor in saved['selected_state_dict'].values():
                self.assertTrue(torch.isfinite(tensor).all())
            self.assertTrue(checkpoint.with_suffix('.failure-injected').exists())
            self.assertFalse(list(Path(temporary).glob('*.tmp')))
            baseline = Path(temporary) / 'baseline.pt'
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', 0))
                baseline_port = listener.getsockname()[1]
            baseline_command = command[:]
            baseline_command[baseline_command.index(f'--master-port={port}')] = f'--master-port={baseline_port}'
            baseline_command[baseline_command.index('--checkpoint') + 1] = str(baseline)
            baseline_command[baseline_command.index('--resume') + 1] = str(baseline)
            baseline_command[baseline_command.index('--metrics') + 1] = str(Path(temporary) / 'baseline.json')
            baseline_command = baseline_command[:-2]
            result = subprocess.run(baseline_command, cwd=Path(__file__).parent, capture_output=True, text=True, timeout=240)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            uninterrupted = torch.load(baseline, weights_only=True)
            for key, weights in saved['state_dict'].items():
                self.assertTrue(torch.equal(weights, uninterrupted['state_dict'][key]), key)
            for recovered, original in zip(saved['metrics'], uninterrupted['metrics']):
                for key in ('epoch', 'train_loss', 'validation_loss', 'accuracy'):
                    self.assertEqual(recovered[key], original[key], key)

if __name__ == '__main__': unittest.main()
