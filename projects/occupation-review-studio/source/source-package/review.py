"""SQLite human review for the occupation demo (standard library only).

The app supplies actor and role from its identity boundary. Public demo role
selectors simulate identities; they are NOT authentication or production RBAC.
Audit records are transactional history, not a tamper-proof audit service.
"""
import json
import math
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

LABELS = ("SOFTWARE", "FINANCE", "HEALTHCARE", "EDUCATION", "TRADES")


def route_confidence(value, auto_accept_threshold=.8, escalate_threshold=.5):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError("Confidence must be a finite number between 0 and 1")
    for threshold in (escalate_threshold,) + (() if auto_accept_threshold is None else (auto_accept_threshold,)):
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not 0 <= threshold <= 1:
            raise ValueError("Thresholds must be finite numbers between 0 and 1")
    if auto_accept_threshold is not None and auto_accept_threshold < escalate_threshold:
        raise ValueError("Auto-accept threshold must be at least escalation threshold")
    return "AUTO_ACCEPT" if auto_accept_threshold is not None and value >= auto_accept_threshold else "HUMAN_REVIEW" if value >= escalate_threshold else "ESCALATE"


class ReviewStore:
    def __init__(self, path=":memory:", auto_accept_threshold=.8, escalate_threshold=.5):
        # Open one store per request when used by a threaded UI; share its file path.
        route_confidence(0, auto_accept_threshold, escalate_threshold)
        self.auto_accept_threshold = auto_accept_threshold
        self.escalate_threshold = escalate_threshold
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY, text TEXT NOT NULL, prediction TEXT NOT NULL,
                confidence REAL NOT NULL, model_version TEXT NOT NULL,
                route TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
                owner TEXT, senior_required INTEGER NOT NULL, final_label TEXT,
                provenance TEXT, corrected INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS history (
                sequence INTEGER PRIMARY KEY, item_id TEXT NOT NULL,
                actor TEXT NOT NULL, role TEXT NOT NULL, timestamp TEXT NOT NULL,
                action TEXT NOT NULL, reason TEXT NOT NULL, snapshot TEXT NOT NULL);
        """)

    def close(self):
        self.db.close()

    def get(self, item_id):
        row = self.db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        if row is None:
            raise ValueError("Unknown item")
        return dict(row)

    def list_items(self):
        return [dict(row) for row in self.db.execute("SELECT * FROM items ORDER BY senior_required DESC, confidence, id")]

    def history(self, item_id):
        self.get(item_id)
        return [dict(row) for row in self.db.execute("SELECT * FROM history WHERE item_id=? ORDER BY sequence", (item_id,))]

    def _audit(self, item, actor, role, action, reason):
        self.db.execute("INSERT INTO history(item_id,actor,role,timestamp,action,reason,snapshot) VALUES(?,?,?,?,?,?,?)",
                        (item["id"], actor, role, datetime.now(timezone.utc).isoformat(), action, reason, json.dumps(item)))

    def add(self, text, prediction, confidence, model_version, route_override=None):
        route = route_confidence(confidence, self.auto_accept_threshold, self.escalate_threshold)
        if route_override not in (None, "ESCALATE"):
            raise ValueError("The only permitted route override is ESCALATE")
        if route_override is not None:
            route = route_override
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Description is required")
        if prediction not in LABELS or not isinstance(model_version, str) or not model_version.strip():
            raise ValueError("Valid prediction and model version required")
        auto = route == "AUTO_ACCEPT"
        item_id = str(uuid4())
        with self.db:
            self.db.execute("INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (item_id, text.strip(), prediction, confidence, model_version, route,
                             "resolved" if auto else "escalated" if route == "ESCALATE" else "pending",
                             0, None, int(route == "ESCALATE"), prediction if auto else None,
                             "MODEL" if auto else None, 0))
            item = self.get(item_id)
            self._audit(item, "inference", "service", "create", "Initial prediction")
        return item

    def transition(self, item_id, actor, role, expected_revision, action, label=None, reason=""):
        """Claim, escalate, resolve, or close out of scope. Stale writes fail.

        Resolved records are immutable; repeated submissions must refresh first.
        No reopen/retraining/SLA behavior is implied by this demo.
        """
        if not isinstance(actor, str) or not actor.strip() or role not in ("reviewer", "senior"):
            raise PermissionError("A reviewer or senior identity is required")
        if not isinstance(reason, str):
            raise ValueError("Reason must be text")
        with self.db:
            # Acquire the SQLite write lock before reading the revision.
            self.db.execute("BEGIN IMMEDIATE")
            item = self.get(item_id)
            if type(expected_revision) is not int or item["revision"] != expected_revision:
                raise ValueError("Stale revision; refresh the item")
            if item["status"] in ("resolved", "out_of_scope"):
                raise ValueError("Completed items cannot be changed")
            if item["senior_required"] and role != "senior":
                raise PermissionError("Escalations require a senior reviewer")
            if action == "claim":
                if item["status"] not in ("pending", "escalated"):
                    raise ValueError("Item is already claimed")
                item.update(status="in_review", owner=actor)
            else:
                if item["status"] != "in_review" or item["owner"] != actor:
                    raise PermissionError("Claim this item before deciding")
                if action not in ("escalate", "resolve", "out_of_scope"):
                    raise ValueError("Unknown review action")
                if not reason.strip():
                    raise ValueError("A decision reason is required")
                if action == "escalate":
                    item.update(status="escalated", owner=None, senior_required=1)
                elif action == "out_of_scope":
                    if role != "senior":
                        raise PermissionError("Only a senior can close out of scope")
                    item.update(status="out_of_scope", final_label=None, provenance="HUMAN")
                else:
                    if label not in LABELS:
                        raise ValueError("Choose a supported occupation label")
                    item.update(status="resolved", final_label=label, provenance="HUMAN", corrected=int(label != item["prediction"]))
            item["revision"] += 1
            self.db.execute("UPDATE items SET status=?,revision=?,owner=?,senior_required=?,final_label=?,provenance=?,corrected=? WHERE id=?",
                            tuple(item[k] for k in ("status", "revision", "owner", "senior_required", "final_label", "provenance", "corrected", "id")))
            self._audit(item, actor, role, action, reason)
        return item
