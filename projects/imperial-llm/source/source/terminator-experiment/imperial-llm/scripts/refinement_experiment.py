"""Tiny offline scratch-training, compute sweep and continued-corpus adaptation smoke run."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.checkpoint import load_checkpoint
NOTICE = "NOTICE: Modified TinyStories sample; see README.md and manifest.json for source and CDLA-Sharing-1.0 terms.\n\n"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def recover_stories(raw, expected_hashes):
    """Recover exact whole stories even if their content contains blank lines."""
    text = raw.decode("utf-8")
    if not text.startswith(NOTICE) or not text.endswith("\n"):
        raise ValueError("Missing corpus notice or terminal newline")
    paragraphs = text[len(NOTICE):-1].split("\n\n")
    stories, pending = [], []
    for paragraph in paragraphs:
        pending.append(paragraph)
        candidate = "\n\n".join(pending)
        if len(stories) < len(expected_hashes) and sha(candidate.encode()) == expected_hashes[len(stories)]:
            stories.append(candidate)
            pending = []
    if pending or len(stories) != len(expected_hashes):
        raise ValueError("Whole-story boundary hashes do not match manifest")
    return stories


def partition(stories):
    if len(stories) < 8 or len(set(stories)) != len(stories):
        raise ValueError("Need at least eight unique training stories")
    ordered = sorted(stories, key=lambda story: sha(story.encode()))
    boundary = 3 * len(ordered) // 4
    return ordered[:boundary], ordered[boundary:]


def configuration(width, vocab_size):
    if width not in (16, 32):
        raise ValueError("Bounded sweep widths are16 and32")
    return dict(n_head=4, n_embed=width, context_length=32, vocab_size=vocab_size, N_BLOCKS=2)


def budget(steps, parameters, batch_size=8, context=32):
    if not 0 <= steps <= 80:
        raise ValueError("Budget must be0..80 steps")
    tokens = steps * batch_size * context
    return {"optimizer_tokens": tokens, "approximate_training_flops_6NT": 6 * parameters * tokens}


def validate_output(output):
    resolved, deployed = output.resolve(), (ROOT / "space").resolve()
    if resolved == deployed or deployed in resolved.parents:
        raise ValueError("The deployed Space cannot contain experiment outputs")
    if output.exists():
        raise ValueError("Output already exists; choose a new directory")


def run(output):
    validate_output(output)
    import torch
    from src.models.transformer import Transformer
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    manifest_path = ROOT / "data/story_corpus/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    groups, input_hashes = {}, {}
    for name in ("train", "val"):
        raw = (ROOT / f"data/story_corpus/{name}.txt").read_bytes()
        details = manifest["splits"][name]
        if sha(raw) != details["sha256"]:
            raise ValueError("Corpus file checksum mismatch: " + name)
        groups[name] = recover_stories(raw, details["story_hashes"])
        input_hashes[name] = sha(raw)
    scratch, adaptation = partition(groups["train"])
    if set(groups["train"]) & set(groups["val"]):
        raise ValueError("Training/validation exact overlap")
    model_bytes = (ROOT / "space/model.json").read_bytes()
    vocab = json.loads(model_bytes)["vocab"]
    stoi = {char: i for i, char in enumerate(vocab)}
    def encode(stories):
        return [torch.tensor([stoi[c] for c in story], dtype=torch.long) for story in stories]
    train_docs, adapt_docs, val_docs = map(encode, (scratch, adaptation, groups["val"]))
    def batch(docs, generator):
        # Windows never cross story boundaries. All experiments use the same draws.
        choices = torch.randint(len(docs), (8,), generator=generator)
        x, y = [], []
        for choice in choices:
            doc = docs[int(choice)]
            start = int(torch.randint(len(doc)-32, (1,), generator=generator))
            x.append(doc[start:start+32]); y.append(doc[start+1:start+33])
        return torch.stack(x), torch.stack(y)
    val_rng = torch.Generator().manual_seed(2702)
    val_windows = [batch(val_docs, val_rng) for _ in range(8)]
    def evaluate(model):
        model.eval()
        with torch.no_grad():
            return sum(float(model(x,y)[1]) for x,y in val_windows) / len(val_windows)
    def train(model, docs, steps, lr):
        optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
        rng = torch.Generator().manual_seed(1729)
        history = [{"step":0, "validation_ce":evaluate(model)}]
        best_loss, best_step, best = history[0]["validation_ce"], 0, copy.deepcopy(model.state_dict())
        started = time.perf_counter()
        for step in range(1, steps+1):
            model.train(); optimizer.zero_grad(set_to_none=True)
            _, loss = model(*batch(docs, rng))
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimizer.step()
            if step % 20 == 0 or step == steps:
                value = evaluate(model)
                history.append({"step":step, "validation_ce":value})
                if value < best_loss:
                    best_loss, best_step, best = value, step, copy.deepcopy(model.state_dict())
        runtime = time.perf_counter()-started
        model.load_state_dict(best); model.eval()
        return {"executed_steps":steps, "selected_step":best_step, "initial_validation_ce":history[0]["validation_ce"],
                "validation_ce":best_loss, "runtime_seconds":runtime, "history":history,
                "learning_rate":lr, "optimizer":"torch.optim.AdamW; other defaults",
                "gradient_clip_norm":1.0, "validation_every_steps":20}
    output.mkdir(parents=True, exist_ok=False)
    records, best_model, best_record = [], None, None
    def save(name, model, cfg, record):
        path = output / (name + ".pt")
        torch.save({"model_state_dict":model.state_dict(), "config":cfg, "vocab":vocab,
                    "executed_steps":record["executed_steps"], "selected_step":record["selected_step"]}, path)
        restored = Transformer(**cfg)
        restored.load_state_dict(load_checkpoint(path, map_location=None)["model_state_dict"])
        restored.eval()
        with torch.no_grad():
            assert torch.equal(model(val_windows[0][0])[0], restored(val_windows[0][0])[0])
        return {"path":path.name, "sha256":sha(path.read_bytes()), "exact_reload_parity":True}
    for width in (16,32):
        for steps in (40,80):
            torch.manual_seed(1729)
            cfg = configuration(width, len(vocab))
            model = Transformer(**cfg)
            record = train(model, train_docs, steps, 0.002)
            params = sum(p.numel() for p in model.parameters())
            record.update({"width":width, "parameters":params, **budget(steps,params), "config":cfg})
            record["checkpoint"] = save(f"scratch-w{width}-s{steps}", model, cfg, record)
            records.append(record)
            if best_record is None or record["validation_ce"] < best_record["validation_ce"]:
                best_model, best_record = copy.deepcopy(model), record
            print(json.dumps({"stage":"scratch", **{k:record[k] for k in ("width","executed_steps","validation_ce","runtime_seconds")}}), flush=True)
    baseline_ce = evaluate(best_model)
    adapted = train(best_model, adapt_docs, 40, 0.001)
    adapted.update({"stage":"continued corpus adaptation on disjoint training stories; same domain",
                    "baseline_validation_ce":baseline_ce, "improved":adapted["validation_ce"] < baseline_ce,
                    "baseline_checkpoint":best_record["checkpoint"], **budget(40,best_record["parameters"])})
    adapted["checkpoint"] = save("adaptation-selected", best_model, best_record["config"], adapted)
    report = {"schema_version":1, "seed":1729, "torch_version":torch.__version__, "device":"cpu", "threads":1,
              "batch_size":8, "context_length":32, "scratch_runs":records, "post_training":adapted,
              "provenance":{"dataset":manifest["dataset"], "revision":manifest["revision"], "license":manifest["license"],
                            "experiment_script_sha256":sha(Path(__file__).read_bytes()),
                            "manifest_sha256":sha(manifest_path.read_bytes()), "input_file_sha256":input_hashes,
                            "alphabet_model_sha256":sha(model_bytes),
                            "scratch_story_hashes":[sha(s.encode()) for s in scratch],
                            "adaptation_story_hashes":[sha(s.encode()) for s in adaptation]},
              "evaluation":{"validation_seed":2702, "batches":8, "windows_per_batch":8,
                            "validation_window_ids_sha256":sha(json.dumps([x.tolist() for x,y in val_windows]).encode()),
                            "test_evaluated":False, "promotion":False},
              "limitations":["Four correlated deterministic tiny runs illustrate a compute sweep, not a universal scaling law.",
                             "6NT FLOPs is an approximate parameter-token proxy; ignores attention/context overhead and evaluation.",
                             "Reported runtime includes training and periodic validation; CPU timing varies.",
                             "Validation is used repeatedly for checkpoint, architecture and budget selection; this is smoke evidence only.",
                             "Existing test has already been observed and is not read or scored here; no fresh-test claims.",
                             "Adaptation uses disjoint same-domain training stories, not instruction tuning, RLHF, new-domain transfer.",
                             "No deployed weights were modified or promoted."]}
    (output / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"metrics":str(output / "metrics.json"), "adaptation_baseline_ce":baseline_ce,
                      "adaptation_selected_ce":adapted["validation_ce"], "promoted":False}), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="New local directory; never the deployed Space")
    args = parser.parse_args()
    if args.output.resolve() == (ROOT / "space").resolve():
        parser.error("The deployed Space cannot be an experiment output")
    run(args.output)


if __name__ == "__main__":
    main()
