"""Prepare a reproducible five-category O*NET® task benchmark (stdlib only).

Run: python prepare_data.py --output-dir data
Downloads only when explicitly executed; cached raw files support offline reruns.
Labels below are a deliberately narrow, simulated project taxonomy, not O*NET's.
"""

import argparse
import csv
import hashlib
import io
import json
import random
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


VERSION = "31.0"
BASE_URL = "https://www.onetcenter.org/dl_files/database/db_31_0_csv/"
SOURCES = {name: BASE_URL + name for name in ("task_statements.csv", "occupation_data.csv")}
ALLOWLIST = {
    # Software creation, testing, web/interface development and systems analysis.
    # This excludes the broader computer/math group and most IT infrastructure.
    "SOFTWARE": ["15-1211.00", "15-1251.00", "15-1252.00", "15-1253.00", "15-1254.00", "15-1255.00"],
    # Accounting, financial analysis/advice, risk, credit, lending and insurance.
    "FINANCE": ["13-2011.00", "13-2023.00", "13-2031.00", "13-2041.00", "13-2051.00", "13-2052.00", "13-2053.00", "13-2054.00", "13-2061.00", "13-2071.00", "13-2072.00", "13-2081.00"],
    # Selected direct clinical and allied-health roles; not all healthcare work.
    "HEALTHCARE": ["29-1021.00", "29-1031.00", "29-1041.00", "29-1051.00", "29-1071.00", "29-1122.00", "29-1123.00", "29-1126.00", "29-1127.00", "29-1141.00", "29-1171.00", "31-1131.00"],
    # Selected school teaching, specialist instruction and education support.
    # 31.0 has separate kindergarten/elementary special-education codes
    # (25-2055 / 25-2056), rather than the obsolete combined 25-2052 code.
    "EDUCATION": ["25-2011.00", "25-2012.00", "25-2021.00", "25-2022.00", "25-2023.00", "25-2031.00", "25-2032.00", "25-2051.00", "25-2055.00", "25-2056.00", "25-2057.00", "25-2058.00", "25-3011.00"],
    # Selected construction, installation and maintenance skilled trades.
    "TRADES": ["47-2021.00", "47-2031.00", "47-2041.00", "47-2051.00", "47-2061.00", "47-2073.00", "47-2111.00", "47-2141.00", "47-2152.00", "47-2181.00", "49-9021.00", "49-9041.00"],
}
ATTRIBUTION = (
    "Includes information from the O*NET® 31.0 Database by the U.S. Department of Labor, "
    "Employment and Training Administration (USDOL/ETA), used under CC BY 4.0 "
    "(https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. "
    "This project filters occupations, maps them to five simulated labels, removes duplicate "
    "task text and assigns grouped splits. USDOL/ETA has not approved, endorsed, or tested "
    "these modifications. Source license: https://www.onetcenter.org/license_db.html"
)


def normalized(text):
    """Conservative exact duplicate key; near duplicates remain a limitation."""
    return re.sub(r"\W+", " ", unicodedata.normalize("NFKC", text).casefold()).strip()


def read_source(name, raw_dir, offline=False):
    path = raw_dir / name
    if not path.exists():
        if offline:
            raise FileNotFoundError(f"Offline source missing: {path}")
        request = urllib.request.Request(SOURCES[name], headers={"User-Agent": "occupation-hitl-case-study/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read()
        # Validate before caching an error page or malformed source.
        rows = list(csv.DictReader(io.StringIO(payload.decode("utf-8-sig"))))
        if not rows or "O*NET-SOC Code" not in rows[0]:
            raise ValueError(f"Unexpected source schema: {name}")
        path.write_bytes(payload)
    payload = path.read_bytes()
    rows = list(csv.DictReader(io.StringIO(payload.decode("utf-8-sig"))))
    return rows, {"url": SOURCES[name], "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload), "rows": len(rows)}


def assign_splits(rows, seed):
    """Stratify labels at occupation level; keep at least one group per split."""
    rng = random.Random(seed)
    assignments = {}
    for label in sorted(ALLOWLIST):
        groups = sorted({row["group"] for row in rows if row["label"] == label})
        if len(groups) < 5:
            raise ValueError(f"{label} needs at least five distinct occupations; found {len(groups)}")
        rng.shuffle(groups)
        n_test = max(1, round(len(groups) * 0.2))
        n_validation = max(1, round(len(groups) * 0.2))
        for index, group in enumerate(groups):
            assignments[group] = "test" if index < n_test else "validation" if index < n_test + n_validation else "train"
    splits = {name: [] for name in ("train", "validation", "test")}
    for row in rows:
        splits[assignments[row["group"]]].append(row)
    for name, examples in splits.items():
        if {row["label"] for row in examples} != set(ALLOWLIST):
            raise ValueError(f"Missing class coverage in {name}")
    return splits


def prepare(output_dir, seed=42, offline=False):
    output_dir = Path(output_dir)
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tasks, task_source = read_source("task_statements.csv", raw_dir, offline)
    occupations, occupation_source = read_source("occupation_data.csv", raw_dir, offline)
    titles = {row["O*NET-SOC Code"]: row["Title"] for row in occupations}
    mapping = {code: label for label, codes in ALLOWLIST.items() for code in codes}
    if len(mapping) != sum(map(len, ALLOWLIST.values())):
        raise ValueError("Occupation allowlists overlap")
    missing = sorted(set(mapping) - set(titles))
    if missing:
        raise ValueError(f"Pinned-source occupation mapping contains missing codes: {missing}")
    excluded_codes = Counter()
    candidates = defaultdict(list)
    empty = 0
    for row in tasks:
        code, text = row["O*NET-SOC Code"], row["Task"].strip()
        if code not in mapping:
            excluded_codes[code] += 1
            continue
        key = normalized(text)
        if not key:
            empty += 1
            continue
        candidates[key].append({"text": text, "label": mapping[code], "group": code, "task_id": row["Task ID"]})
    # Remove ALL members of duplicate clusters: never move a task between groups
    # and never choose an arbitrary category for conflicting duplicate text.
    rows = [cluster[0] for cluster in candidates.values() if len(cluster) == 1]
    duplicate_rows = sum(len(cluster) for cluster in candidates.values() if len(cluster) > 1)
    splits = assign_splits(sorted(rows, key=lambda r: (r["label"], r["group"], r["task_id"])), seed)
    manifest = []
    counts = {}
    for name, examples in splits.items():
        path = output_dir / f"{name}.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["text", "label", "group"])
            writer.writeheader()
            writer.writerows({key: row[key] for key in ("text", "label", "group")} for row in examples)
        counts[name] = {"rows": len(examples), "labels": dict(Counter(row["label"] for row in examples)), "groups": len({row["group"] for row in examples}), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        manifest.extend({"split": name, "occupation_code": row["group"], "task_id": row["task_id"], "text_sha256": hashlib.sha256(row["text"].encode()).hexdigest()} for row in examples)
    provenance = {
        "source_version": VERSION, "created_utc": datetime.now(timezone.utc).isoformat(), "seed": seed,
        "sources": {"task_statements": task_source, "occupation_data": occupation_source},
        "attribution": ATTRIBUTION, "mapping": {label: {code: titles[code] for code in codes} for label, codes in ALLOWLIST.items()},
        "mapping_status": "Independent case study with simulated business requirements; narrow project labels, not official O*NET® categories.",
        "split_policy": "60/20/20 approximate occupation-group allocation within each label; all tasks from one exact SOC code stay together; vocabulary must be fitted on train only.",
        "dedup_policy": "NFKC, casefold, punctuation/whitespace normalization; all members of repeated normalized-text clusters removed globally before splitting.",
        "exclusions": {"outside_allowlist_rows": sum(excluded_codes.values()), "outside_allowlist_occupations": len(excluded_codes), "by_occupation": dict(sorted(excluded_codes.items())), "empty_text_rows": empty, "duplicate_rows_removed": duplicate_rows},
        "splits": counts, "records": manifest,
        "limitations": ["O*NET® tasks are not real job advertisements.", "Narrow categories omit many valid occupations; classifier is closed-set and confidence does not guarantee out-of-scope detection.", "Exact normalized deduplication does not eliminate near duplicates or shared terminology.", "Only six software occupations are selected, so grouped uncertainty estimates will be imprecise.", "Source hashes record downloaded bytes; no independently trusted expected hash is supplied.", "Threshold selection and calibration must use validation only; final test must remain untouched until evaluation."],
    }
    (output_dir / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    (output_dir / "ATTRIBUTION.txt").write_text(ATTRIBUTION + "\n", encoding="utf-8")
    return provenance


def self_check():
    rows = [{"text": f"{label} task {i}", "label": label, "group": f"{label}-{i}"} for label in ALLOWLIST for i in range(6)]
    splits = assign_splits(rows, 42)
    groups = [{r["group"] for r in part} for part in splits.values()]
    assert all(not left.intersection(right) for i, left in enumerate(groups) for right in groups[i + 1:])
    assert splits == assign_splits(rows, 42)
    assert normalized("  Build, SOFTWARE! ") == normalized("build software")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="data")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        print("Grouped split, determinism and normalization checks passed.")
    else:
        result = prepare(args.output_dir, args.seed, args.offline)
        print(json.dumps(result["splits"], indent=2))
