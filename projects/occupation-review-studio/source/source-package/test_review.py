import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from review import ReviewStore, route_confidence


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.store = ReviewStore()
        self.addCleanup(self.store.close)

    def item(self, confidence=.6):
        return self.store.add("Writes software", "SOFTWARE", confidence, "test-v1")

    def test_routing_and_invalid_input(self):
        for score, route in ((.8, "AUTO_ACCEPT"), (.7999, "HUMAN_REVIEW"), (.5, "HUMAN_REVIEW"), (.4999, "ESCALATE")):
            self.assertEqual(route_confidence(score), route)
        for score in (float("nan"), float("inf"), -.1, 1.1, None, True):
            with self.assertRaises(ValueError):
                route_confidence(score)
        with self.assertRaises(ValueError):
            self.store.add("  ", "SOFTWARE", .6, "v1")

    def test_auto_and_unresolved_final_labels(self):
        auto = self.item(.9)
        self.assertEqual((auto["status"], auto["final_label"], auto["provenance"]), ("resolved", "SOFTWARE", "MODEL"))
        for score in (.6, .2):
            self.assertIsNone(self.item(score)["final_label"])

    def test_disabled_auto_accept_and_threshold_validation(self):
        self.assertEqual(route_confidence(1, None), "HUMAN_REVIEW")
        store = ReviewStore(auto_accept_threshold=None)
        try:
            item = store.add("Software", "SOFTWARE", 1, "v1")
            self.assertEqual(item["status"], "pending")
            self.assertIsNone(item["final_label"])
        finally:
            store.close()
        for auto, low in ((.4, .5), (float("nan"), .5), (.8, True), (.8, -1)):
            with self.assertRaises(ValueError):
                ReviewStore(auto_accept_threshold=auto, escalate_threshold=low)

    def test_forced_escalation_cannot_weaken_review(self):
        item = self.store.add("Unknown vocabulary", "SOFTWARE", .99, "v1", route_override="ESCALATE")
        self.assertEqual((item["route"], item["status"], item["senior_required"]), ("ESCALATE", "escalated", 1))
        self.assertIsNone(item["final_label"])
        with self.assertRaises(ValueError):
            self.store.add("Ambiguous", "SOFTWARE", .1, "v1", route_override="AUTO_ACCEPT")

    def test_correction_history_and_immutable_resolution(self):
        item = self.item()
        item = self.store.transition(item["id"], "alice", "reviewer", 0, "claim")
        self.assertIsNone(item["final_label"])
        item = self.store.transition(item["id"], "alice", "reviewer", 1, "resolve", "FINANCE", "Description clarified")
        self.assertEqual((item["status"], item["final_label"], item["corrected"]), ("resolved", "FINANCE", 1))
        history = self.store.history(item["id"])
        self.assertEqual(len(history), 3)
        self.assertEqual(history[-1]["actor"], "alice")
        self.assertEqual(json.loads(history[-1]["snapshot"])["model_version"], "test-v1")
        with self.assertRaises(ValueError):
            self.store.transition(item["id"], "alice", "reviewer", 2, "resolve", "TRADES", "Overwrite")

    def test_escalation_authorization_and_out_of_scope(self):
        item = self.item(.2)
        for actor, role in (("alice", "reviewer"), ("reader", "auditor"), ("", "senior")):
            with self.assertRaises(PermissionError):
                self.store.transition(item["id"], actor, role, 0, "claim")
        self.assertEqual(self.store.get(item["id"])["revision"], 0)
        self.store.transition(item["id"], "senior", "senior", 0, "claim")
        closed = self.store.transition(item["id"], "senior", "senior", 1, "out_of_scope", reason="Taxonomy does not cover this")
        self.assertEqual(closed["status"], "out_of_scope")
        self.assertIsNone(closed["final_label"])

    def test_manual_escalation_and_claim_owner(self):
        item = self.item()
        self.store.transition(item["id"], "alice", "reviewer", 0, "claim")
        with self.assertRaises(PermissionError):
            self.store.transition(item["id"], "bob", "reviewer", 1, "resolve", "FINANCE", "Wrong owner")
        for invalid_label, reason in (("OTHER", "Unsupported label"), ("SOFTWARE", "")):
            with self.assertRaises(ValueError):
                self.store.transition(item["id"], "alice", "reviewer", 1, "resolve", invalid_label, reason)
            self.assertEqual(self.store.get(item["id"])["revision"], 1)
            self.assertIsNone(self.store.get(item["id"])["final_label"])
        item = self.store.transition(item["id"], "alice", "reviewer", 1, "escalate", reason="Ambiguous")
        self.assertEqual((item["status"], item["senior_required"]), ("escalated", 1))
        self.assertIsNone(item["final_label"])
        with self.assertRaises(PermissionError):
            self.store.transition(item["id"], "alice", "reviewer", 2, "claim")

    def test_stale_competing_writer_and_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "review.db"
            first, second = ReviewStore(path), ReviewStore(path)
            try:
                item = first.add("Teach classes", "EDUCATION", .6, "v1")
                first.transition(item["id"], "alice", "reviewer", 0, "claim")
                with self.assertRaisesRegex(ValueError, "Stale"):
                    second.transition(item["id"], "bob", "reviewer", 0, "claim")
                self.assertEqual(second.get(item["id"])["owner"], "alice")
            finally:
                first.close()
                second.close()

    def test_audit_write_failure_rolls_back_resolution(self):
        item = self.item()
        self.store.transition(item["id"], "alice", "reviewer", 0, "claim")
        self.store.db.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'disk simulation'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.transition(item["id"], "alice", "reviewer", 1, "resolve", "SOFTWARE", "Confirmed")
        after = self.store.get(item["id"])
        self.assertEqual((after["status"], after["revision"], after["final_label"]), ("in_review", 1, None))
        self.assertEqual(len(self.store.history(item["id"])), 2)

    def test_audit_failure_does_not_create_an_untracked_prediction(self):
        self.store.db.execute("CREATE TRIGGER fail_create_audit BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.item()
        self.assertEqual(self.store.list_items(), [])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM history").fetchone()[0], 0)
        self.assertFalse(self.store.db.in_transaction)

    def test_concurrent_claims_have_one_owner_and_one_audit_event(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "concurrent.db"
            initial = ReviewStore(path)
            try:
                item = initial.add("Teach classes", "EDUCATION", .6, "v1")
            finally:
                initial.close()
            ready = threading.Barrier(2)

            def claim(actor):
                connection = ReviewStore(path)
                try:
                    ready.wait(timeout=5)
                    try:
                        connection.transition(item["id"], actor, "reviewer", 0, "claim")
                        return actor, "claimed"
                    except ValueError as exc:
                        return actor, str(exc)
                finally:
                    connection.close()

            with ThreadPoolExecutor(max_workers=2) as workers:
                outcomes = dict(workers.map(claim, ("alice", "bob")))
            winners = [actor for actor, outcome in outcomes.items() if outcome == "claimed"]
            self.assertEqual(len(winners), 1)
            self.assertEqual(sum("Stale revision" in outcome for outcome in outcomes.values()), 1)
            reopened = ReviewStore(path)
            try:
                saved = reopened.get(item["id"])
                self.assertEqual((saved["owner"], saved["revision"], saved["status"]), (winners[0], 1, "in_review"))
                self.assertIsNone(saved["final_label"])
                self.assertEqual(len(reopened.history(item["id"])), 2)
            finally:
                reopened.close()

    def test_completed_decision_and_provenance_survive_reopening(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "persistent.db"
            connection = ReviewStore(path)
            try:
                item = connection.add("Writes software", "SOFTWARE", .6, "frozen-model-v1")
                connection.transition(item["id"], "alice", "reviewer", 0, "claim")
                final = connection.transition(item["id"], "alice", "reviewer", 1, "resolve", "FINANCE", "Corrected in simulated review")
            finally:
                connection.close()
            reopened = ReviewStore(path)
            try:
                self.assertEqual(reopened.get(item["id"]), final)
                event = reopened.history(item["id"])[-1]
                self.assertEqual((event["actor"], event["role"], event["reason"]), ("alice", "reviewer", "Corrected in simulated review"))
                self.assertEqual(datetime.fromisoformat(event["timestamp"]).utcoffset().total_seconds(), 0)
                self.assertEqual(json.loads(event["snapshot"]), final)
            finally:
                reopened.close()


if __name__ == "__main__":
    unittest.main()
