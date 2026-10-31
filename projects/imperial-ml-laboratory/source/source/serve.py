"""Local demonstration supervisor and validated digit-classification API."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import os
import pickle
import re
from types import SimpleNamespace
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
from typing import Annotated
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat
import torch
from model import build_model, load_data

BASE = Path(__file__).resolve().parent
Pixel = Annotated[FiniteFloat, Field(ge=0, le=1)]
PixelRow = Annotated[list[Pixel], Field(min_length=64, max_length=64)]

class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pixels: Annotated[list[PixelRow], Field(min_length=1, max_length=128)]

class TrainingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    epochs: Annotated[int, Field(strict=True, ge=1, le=30)] = 12
    workers: Annotated[int, Field(strict=True, ge=1, le=2)] = 2
    inject_failure: Annotated[bool, Field(strict=True)] = False

class PromotionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]

def now():
    return datetime.now(timezone.utc).isoformat()

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def load_checkpoint(path):
    try:
        payload = Path(path).read_bytes()
        checkpoint = torch.load(io.BytesIO(payload), map_location="cpu", weights_only=True)
        if (not isinstance(checkpoint, dict) or checkpoint.get("schema_version") != 2
                or checkpoint.get("input_dim") != 64 or checkpoint.get("classes") != 10):
            raise ValueError("unsupported checkpoint schema")
        model = build_model()
        supplied = checkpoint["selected_state_dict"]
        expected = model.state_dict()
        if not isinstance(supplied, dict) or set(supplied) != set(expected):
            raise ValueError("invalid checkpoint parameter names")
        for name, tensor in supplied.items():
            if (not isinstance(tensor, torch.Tensor) or tensor.shape != expected[name].shape
                    or tensor.dtype != expected[name].dtype or not torch.isfinite(tensor).all()):
                raise ValueError("invalid checkpoint parameter shape, dtype or values")
        model.load_state_dict(supplied, strict=True)
        model.eval()
        return model, hashlib.sha256(payload).hexdigest()
    except (OSError, RuntimeError, KeyError, TypeError, IndexError, AttributeError, OverflowError, EOFError, pickle.UnpicklingError) as error:
        raise ValueError("checkpoint cannot be safely loaded") from error

def record(run_id):
    directory = app.state.runtime.runs / run_id
    if not directory.is_dir():
        raise HTTPException(404, "run unavailable")
    try:
        value = json.loads((directory / "status.json").read_text())
        if not isinstance(value, dict) or value.get("id") != run_id or value.get("status") not in {"running", "completed", "failed"}:
            raise ValueError("invalid run record")
    except (ValueError, OSError):
        return {"id": run_id, "status": "failed", "error": "run metadata is unavailable or corrupt", "history": []}
    metrics = directory / "metrics.json"
    if metrics.exists():
        try:
            measured = json.loads(metrics.read_text())
            if not isinstance(measured, dict) or not isinstance(measured.get("history", []), list):
                raise ValueError("invalid metrics")
            value.update({k: measured[k] for k in ("training", "dataset", "total_train_seconds", "evaluation", "best_epoch", "best_validation_loss") if k in measured})
            value["history"] = measured.get("history", [])
        except (ValueError, OSError, TypeError):
            pass
    value.setdefault("history", [])
    log = directory / "train.log"
    if log.exists():
        with log.open("rb") as stream:
            stream.seek(max(0, log.stat().st_size - 12000))
            value["log_tail"] = stream.read().decode(errors="replace")
    return value

def controls():
    if app.state.runtime.read_only:
        raise HTTPException(403, "training and promotion are disabled in this public demo")

def reserve_port():
    # Handoff has a small race; the launcher reports bind failures as failed runs.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]

def supervise(state, run, directory):
    status = directory / "status.json"
    try:
        port = reserve_port()
        command = [sys.executable, "-m", "torch.distributed.run", "--nnodes=1",
                   f"--nproc-per-node={run['workers']}", "--master-addr=127.0.0.1",
                   f"--master-port={port}", "--max-restarts=1", str(BASE / "train.py"),
                   "--epochs", str(run["epochs"]), "--checkpoint", str(directory / "checkpoint.pt"),
                   "--metrics", str(directory / "metrics.json"), "--resume", str(directory / "checkpoint.pt")]
        if run["inject_failure"]:
            command += ["--fail-once-rank1-at-epoch", "2"]
        with (directory / "train.log").open("w") as log:
            with state.lock:
                if state.stopping:
                    raise RuntimeError("server is stopping")
                process = subprocess.Popen(command, cwd=BASE, stdout=log, stderr=subprocess.STDOUT,
                                           start_new_session=True)
                state.process = process
            try:
                code = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, 15)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, 9)
                    process.wait()
                raise RuntimeError("training exceeded 600-second deadline")
        if code:
            raise RuntimeError(f"training exited with code {code}; inspect log_tail")
        _, digest = load_checkpoint(directory / "checkpoint.pt")
        run.update(status="completed", checkpoint_sha256=digest)
    except Exception as error:
        run.update(status="failed", error=str(error))
    finally:
        run["updated_at"] = now()
        with state.lock:
            try:
                atomic_json(status, run)
            finally:
                state.busy = False
                state.process = None

@asynccontextmanager
async def lifespan(application):
    state = SimpleNamespace()
    application.state.runtime = state
    torch.set_num_threads(1)
    state.lock = threading.RLock()
    state.busy = False
    state.stopping = False
    state.worker = None
    state.process = None
    state.model = None
    state.active = None
    state.read_only = os.getenv("DEMO_READ_ONLY", "false").lower() == "true"
    state.runs = Path(os.getenv("DEMO_RUNS_DIR", "artifacts/runs")).resolve()
    state.pointer = Path(os.getenv("DEMO_ACTIVE_MODEL", "artifacts/active-model.json")).resolve()
    state.runs.mkdir(parents=True, exist_ok=True)
    for path in state.runs.glob("*/status.json"):
        try:
            saved = json.loads(path.read_text())
            if not isinstance(saved, dict):
                continue
        except (OSError, ValueError):
            continue
        if saved.get("status") == "running":
            saved.update(status="failed", error="supervisor restarted; prior job completion unknown", updated_at=now())
            atomic_json(path, saved)
    if state.pointer.exists():
        pointer = json.loads(state.pointer.read_text())
        model, digest = load_checkpoint(Path(pointer["checkpoint"]))
        if digest != pointer["model_version"]:
            raise ValueError("active artifact digest mismatch")
        state.model, state.active = model, {"run_id": pointer["run_id"], "model_version": digest}
    elif os.getenv("MODEL_CHECKPOINT"):
        model, digest = load_checkpoint(Path(os.environ["MODEL_CHECKPOINT"]))
        state.model, state.active = model, {"run_id": "bootstrap", "model_version": digest}
    data = load_data()
    x, y = data[-2:]
    state.samples = [{"id": i, "pixels": x[i].tolist(), "label": int(y[i])} for i in range(min(40, len(x)))]
    try:
        yield
    finally:
        with state.lock:
            state.stopping = True
            process = state.process
            if process is not None and process.poll() is None:
                try:
                    os.killpg(process.pid, 15)
                except ProcessLookupError:
                    pass
        if process is not None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, 9)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
        if state.worker is not None:
            state.worker.join(timeout=10)

app = FastAPI(title="Distributed ML digit classifier", lifespan=lifespan)

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/health/live")
def live():
    return {"status": "alive"}

@app.get("/health/ready")
def ready():
    with app.state.runtime.lock:
        if app.state.runtime.model is None:
            raise HTTPException(503, "promote a completed model first")
        return {"status": "ready", "model_version": app.state.runtime.active["model_version"]}

@app.get("/api/status")
def status():
    with app.state.runtime.lock:
        return {"read_only": app.state.runtime.read_only, "active_model": app.state.runtime.active, "training_busy": app.state.runtime.busy}

@app.get("/api/runs")
def runs():
    with app.state.runtime.lock:
        records = [record(p.name) for p in app.state.runtime.runs.iterdir()
                   if p.is_dir() and re.fullmatch(r"[a-f0-9]{32}", p.name) and (p / "status.json").exists()]
    return {"runs": sorted(records, key=lambda run: str(run.get("created_at", "")), reverse=True)}

@app.get("/api/benchmark")
def benchmark():
    path = BASE / "evidence" / "benchmark.json"
    if not path.exists():
        raise HTTPException(404, "benchmark has not been measured")
    return json.loads(path.read_text())

@app.get("/api/samples")
def samples():
    return {"samples": app.state.runtime.samples}

@app.post("/api/train", status_code=202)
def train(request: TrainingRequest):
    controls()
    if request.inject_failure and (request.workers != 2 or request.epochs < 3):
        raise HTTPException(422, "failure recovery requires two workers and at least three epochs")
    with app.state.runtime.lock:
        if app.state.runtime.stopping:
            raise HTTPException(503, "server is stopping")
        if app.state.runtime.busy:
            raise HTTPException(409, "another training run is active")
        run_id = uuid.uuid4().hex
        directory = app.state.runtime.runs / run_id
        run = {"id": run_id, "status": "running", **request.model_dump(), "created_at": now(), "updated_at": now()}
        atomic_json(directory / "status.json", run)
        app.state.runtime.busy = True
        app.state.runtime.worker = threading.Thread(target=supervise, args=(app.state.runtime, run, directory), daemon=True)
        app.state.runtime.worker.start()
        return {**run, "history": []}

@app.post("/api/promote")
def promote(request: PromotionRequest):
    controls()
    with app.state.runtime.lock:
        run = record(request.run_id)
        if run["status"] != "completed":
            raise HTTPException(409, "only completed runs can be promoted")
        checkpoint = app.state.runtime.runs / request.run_id / "checkpoint.pt"
        try:
            model, digest = load_checkpoint(checkpoint)
            if digest != run.get("checkpoint_sha256"):
                raise ValueError("completed artifact digest mismatch")
        except (OSError, ValueError, RuntimeError, KeyError) as error:
            raise HTTPException(409, str(error)) from error
        atomic_json(app.state.runtime.pointer, {"run_id": request.run_id, "model_version": digest, "checkpoint": str(checkpoint)})
        app.state.runtime.model, app.state.runtime.active = model, {"run_id": request.run_id, "model_version": digest}
        return app.state.runtime.active

@app.post("/predict")
def predict(request: PredictionRequest):
    with app.state.runtime.lock:
        model, active = app.state.runtime.model, app.state.runtime.active
    if model is None:
        raise HTTPException(503, "promote a completed model first")
    with torch.inference_mode():
        probabilities = torch.softmax(model(torch.tensor(request.pixels, dtype=torch.float32)), dim=1)
    if not torch.isfinite(probabilities).all():
        raise HTTPException(422, "nonfinite model output")
    confidence, classes = probabilities.max(dim=1)
    return {"classes": classes.tolist(), "confidences": confidence.tolist(), "probabilities": probabilities.tolist(),
            "model_version": active["model_version"]}
