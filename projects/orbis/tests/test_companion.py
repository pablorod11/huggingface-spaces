import unittest, tempfile, pathlib, json, time, hmac, hashlib, threading, urllib.request, urllib.error, sqlite3, sys, types
from companion.runner import Runner, create_server, validate_rows
from unittest.mock import patch, MagicMock

ROW = dict(
    id="1",
    date="2026-01-01",
    region="East",
    country="US",
    channel="Web",
    category="Home",
    product="Lamp",
    revenue=100,
    cost=60,
    orders=2,
    units=3,
)


class CompanionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name)
        self.csv = self.path / "demo.csv"
        self.csv.write_text(
            ",".join(ROW) + "\n" + ",".join(map(str, ROW.values())) + "\n"
        )
        self.config = dict(
            token="a" * 32,
            eventSecret="b" * 32,
            allowedOrigins=["http://localhost:8000"],
            database=str(self.path / "state.db"),
            outputDir=str(self.path / "exports"),
            sources=[dict(id="demo", label="Demo", type="sqlite", csv=str(self.csv))],
        )
        self.runner = Runner(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def test_snapshot(self):
        snap = self.runner.snapshot("demo")
        self.assertEqual(snap["rows"][0], ROW)
        self.assertEqual(snap["dataThrough"], "2026-01-01")

    def test_validation(self):
        for row in [
            dict(ROW, revenue=-1),
            dict(ROW, date="2026-02-30"),
            dict(ROW, units=1.5),
        ]:
            with self.assertRaises(ValueError):
                validate_rows([row])
        with self.assertRaises(ValueError):
            validate_rows([ROW, ROW])

    def test_config(self):
        for patch in [
            dict(token=""),
            dict(allowedOrigins=["*"]),
            dict(sources=[dict(id="x", type="semantic", url="http://example.com")]),
        ]:
            with self.assertRaises(ValueError):
                Runner(dict(self.config, **patch))

    def test_operations_reports_unconfigured_webhook_without_side_effects(self):
        self.assertEqual(
            self.runner.operations(),
            dict(
                webhookConfigured=False,
                artifacts="local companion output",
                immediateRetries=False,
                schedulerMode="owner-operated",
            ),
        )

    def test_authenticated_sources_exposes_only_safe_operations_metadata(self):
        webhook = "https://hooks.example.test/private-delivery-endpoint?key=private-key"
        runner = Runner(dict(self.config, webhook=webhook))
        server = create_server(runner, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/api/sources"
        try:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url)
            self.assertEqual(error.exception.code, 401)
            error.exception.close()
            request = urllib.request.Request(
                url, headers={"Authorization": "Bearer " + self.config["token"]}
            )
            with urllib.request.urlopen(request) as response:
                serialized = response.read().decode()
            result = json.loads(serialized)
            self.assertEqual(result["sources"][0]["id"], "demo")
            self.assertEqual(
                result["operations"],
                dict(
                    webhookConfigured=True,
                    artifacts="local companion output",
                    immediateRetries=False,
                    schedulerMode="owner-operated",
                ),
            )
            for private_value in (
                webhook, "hooks.example.test", "private-key", self.config["token"],
                self.config["eventSecret"], self.config["database"],
                self.config["outputDir"], str(self.csv),
            ):
                self.assertNotIn(private_value, serialized)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_run_and_errors(self):
        result = self.runner.run("demo", True)
        self.assertEqual(result["status"], "success")
        self.assertEqual(len(result["files"]), 4)
        for f in result["files"]:
            self.assertTrue(pathlib.Path(f).exists())
        with self.assertRaises(ValueError):
            self.runner.run("missing", True)
        self.assertEqual(self.runner.logs()[0]["status"], "error")

    def test_nonfinite_aggregate_fails_before_success_exports_or_delivery(self):
        from companion.infrastructure import FIELDS as INFRA_FIELDS, SCHEMA

        infrastructure_row = dict(zip(INFRA_FIELDS, [
            "infra-1", "2026-01-01T00:00:00Z", 1, "production", "aws",
            "us-east-1", "enterprise", 100, 0, 1e308, 20, 5, 3, 2,
            100, 20, 200, 100, 500, 250, 1000, 20, 15, 0.99,
        ]))
        for schema, first in [("retail-v1", dict(ROW, revenue=1e308)), (SCHEMA, infrastructure_row)]:
            for dry_run in (True, False):
                with self.subTest(schema=schema, dry_run=dry_run):
                    rows = [first, dict(first, id="second")]
                    if schema == SCHEMA:
                        rows[1]["timestamp"] = "2026-01-01T01:00:00Z"
                    self.runner.sources["demo"]["schema"] = schema
                    # Use the actual source validator and digest code for both schemas.
                    rows = self.runner.validator(self.runner.sources["demo"])(rows)
                    snapshot = dict(rows=rows, fetchedAt="2026-01-02T00:00:00Z", dataThrough="2026-01-01T02:00:00Z" if schema == SCHEMA else "2026-01-01")
                    with patch.object(self.runner, "snapshot", return_value=snapshot), patch.object(self.runner, "deliver") as deliver:
                        with self.assertRaisesRegex(ValueError, "finite"):
                            self.runner.run("demo", dry_run)
                        if dry_run:
                            deliver.assert_not_called()
                        else:
                            self.assertEqual(deliver.call_count, 1)
                            self.assertEqual(deliver.call_args.args[0]["type"], "run.failed")
                    self.assertEqual(self.runner.logs()[0]["status"], "error")
                    exports = list(self.path.glob("exports/*"))
                    self.assertTrue(exports)
                    self.assertTrue(all(path.name.startswith("failure-") for path in exports))

    def test_scheduler(self):
        self.runner.set_schedules(
            [
                dict(
                    id="daily",
                    sourceId="demo",
                    enabled=True,
                    everyMinutes=5,
                    dryRun=True,
                )
            ]
        )
        due = self.runner.schedules()[0]["nextRunAt"]
        self.assertEqual(self.runner.tick(due), 1)
        self.assertEqual(self.runner.tick(due), 0)
        other = Runner(self.config)
        self.assertGreater(other.schedules()[0]["nextRunAt"], due)
        with self.assertRaises(ValueError):
            other.set_schedules(
                [
                    dict(
                        id="x",
                        sourceId="demo",
                        enabled=True,
                        everyMinutes=0,
                        dryRun=True,
                    )
                ]
            )

    def test_event(self):
        raw = json.dumps(
            dict(
                eventId="evt1",
                type="pipeline.failed",
                occurredAt="2026-01-01T00:00:00Z",
                sourceId="demo",
                payload={},
            )
        ).encode()
        stamp = str(int(time.time()))
        sig = hmac.new(
            b"b" * 32, stamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
        self.runner.event(raw, stamp, sig)
        self.assertEqual(
            self.runner.snapshot("demo")["pipelineStatus"]["status"], "failed"
        )
        for body, ts, signature in [
            (raw, stamp, sig),
            (raw + b" ", stamp, sig),
            (raw, "1", sig),
        ]:
            with self.assertRaises(ValueError):
                self.runner.event(body, ts, signature)

    def send_pipeline_event(self, event_id, status, occurred_at):
        raw = json.dumps(dict(
            eventId=event_id, type="pipeline." + status,
            occurredAt=occurred_at, sourceId="demo", payload={},
        )).encode()
        stamp = str(int(time.time()))
        signature = hmac.new(
            b"b" * 32, stamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
        return self.runner.event(raw, stamp, signature)

    def test_delayed_failure_does_not_replace_newer_status_or_alert(self):
        self.runner.config["deliverPipelineAlerts"] = True
        self.send_pipeline_event("new-success", "success", "2026-01-03T00:00:00Z")
        with patch.object(self.runner, "deliver") as deliver:
            self.send_pipeline_event("old-failure", "failed", "2026-01-02T00:00:00Z")
            deliver.assert_not_called()
        status = self.runner.snapshot("demo")["pipelineStatus"]
        self.assertEqual(status["status"], "success")
        self.assertEqual(status["lastSuccess"], "2026-01-03T00:00:00Z")
        self.assertFalse(list(self.path.glob("exports/pipeline-failure-*.webhook.json")))
        with self.assertRaisesRegex(ValueError, "already received"):
            self.send_pipeline_event("old-failure", "failed", "2026-01-02T00:00:00Z")

    def test_delayed_success_advances_last_success_without_regressing_status(self):
        self.send_pipeline_event("first-success", "success", "2026-01-01T00:00:00Z")
        self.send_pipeline_event("latest-running", "running", "2026-01-04T00:00:00Z")
        self.send_pipeline_event("delayed-success", "success", "2026-01-03T01:00:00+01:00")
        status = self.runner.snapshot("demo")["pipelineStatus"]
        self.assertEqual(status["status"], "running")
        self.assertEqual(status["lastSuccess"], "2026-01-03T00:00:00Z")
        self.send_pipeline_event("older-success", "success", "2026-01-02T00:00:00Z")
        self.assertEqual(self.runner.snapshot("demo")["pipelineStatus"], status)
        self.runner = Runner(self.config)
        self.assertEqual(self.runner.snapshot("demo")["pipelineStatus"], status)

    def test_equal_event_instants_use_failure_then_success_then_running(self):
        self.runner.config["deliverPipelineAlerts"] = True
        with patch.object(self.runner, "deliver") as deliver:
            self.send_pipeline_event("same-running", "running", "2026-01-03T00:00:00Z")
            self.send_pipeline_event("same-success", "success", "2026-01-03T01:00:00+01:00")
            self.assertEqual(self.runner.snapshot("demo")["pipelineStatus"]["status"], "success")
            self.send_pipeline_event("same-failure", "failed", "2026-01-02T19:00:00-05:00")
            deliver.assert_called_once()
            status = self.runner.snapshot("demo")["pipelineStatus"]
            self.assertEqual(status["status"], "failed")
            self.assertEqual(status["occurredAt"], "2026-01-03T00:00:00Z")
            self.send_pipeline_event("same-failure-again", "failed", "2026-01-03T00:00:00Z")
            self.send_pipeline_event("same-success-again", "success", "2026-01-03T00:00:00Z")
            self.send_pipeline_event("same-running-again", "running", "2026-01-03T00:00:00Z")
            deliver.assert_called_once()
        self.assertEqual(self.runner.snapshot("demo")["pipelineStatus"], status)

    def test_legacy_pipeline_recovers_chronology_from_persisted_events(self):
        for incoming_status in ("success", "running"):
            with self.subTest(incoming_status=incoming_status):
                with self.runner.connect() as db:
                    db.execute("DELETE FROM events")
                    db.execute("DELETE FROM pipeline")
                self.send_pipeline_event("legacy-success", "success", "2026-01-01T00:00:00Z")
                self.send_pipeline_event("legacy-failure", "failed", "2026-01-04T01:00:00+01:00")
                with self.runner.connect() as db:
                    legacy = json.loads(db.execute("SELECT body FROM pipeline WHERE source='demo'").fetchone()[0])
                    del legacy["occurredAt"]
                    db.execute("UPDATE pipeline SET body=? WHERE source='demo'", (json.dumps(legacy),))
                    # Receiver payloads share the events table but are not pipeline history.
                    for event_id, body in [
                        ("receiver-fixture", dict(type="digest", value=42)),
                        ("receiver-invalid-type", dict(sourceId="demo", type=["pipeline.failed"])),
                        ("receiver-invalid-date", dict(sourceId="demo", eventId="bad-date", type="pipeline.failed", occurredAt=42)),
                    ]:
                        db.execute("INSERT INTO events VALUES (?,?)", (event_id, json.dumps(body)))
                self.runner = Runner(self.config)
                self.send_pipeline_event("delayed", incoming_status, "2026-01-03T00:00:00Z")
                status = self.runner.snapshot("demo")["pipelineStatus"]
                self.assertEqual(status["status"], "failed")
                self.assertEqual(status["occurredAt"], "2026-01-04T00:00:00Z")
                self.assertEqual(status["lastSuccess"], "2026-01-03T00:00:00Z" if incoming_status == "success" else "2026-01-01T00:00:00Z")

    def test_source_date_span(self):
        with self.assertRaisesRegex(ValueError, "7310"):
            validate_rows(
                [dict(ROW, date="0001-01-01"), dict(ROW, id="2", date="9999-12-31")]
            )

    def test_local_receiver(self):
        from companion.receiver import create_receiver

        server = create_receiver(self.runner, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        raw = json.dumps({"type": "digest", "value": 42}).encode()
        stamp = str(int(time.time()))
        sig = hmac.new(
            b"b" * 32, stamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()

        def post(body=raw, signature=sig):
            req = urllib.request.Request(
                "http://127.0.0.1:" + str(server.server_port),
                data=body,
                headers={
                    "X-Ledgerline-Timestamp": stamp,
                    "X-Ledgerline-Signature": signature,
                },
                method="POST",
            )
            return urllib.request.urlopen(req)

        try:
            with post() as response:
                self.assertEqual(response.status, 204)
            with self.assertRaises(urllib.error.HTTPError) as e:
                post()
            self.assertEqual(e.exception.code, 400)
            e.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as e:
                post(raw + b" ")
            self.assertEqual(e.exception.code, 400)
            e.exception.close()
            with self.runner.connect() as db:
                self.assertEqual(
                    db.execute(
                        "SELECT COUNT(*) FROM events WHERE id LIKE 'receiver-%'"
                    ).fetchone()[0],
                    1,
                )
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_semantic_mock(self):
        config = dict(
            self.config,
            sources=[
                dict(
                    id="semantic",
                    label="Semantic",
                    type="semantic",
                    url="https://warehouse.example/facts",
                )
            ],
        )
        runner = Runner(config)
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(
            {"rows": [ROW]}
        ).encode()
        opener = MagicMock()
        opener.open.return_value = response
        with patch("companion.runner.urllib.request.build_opener", return_value=opener):
            self.assertEqual(runner.snapshot("semantic")["rows"][0], ROW)
        response.__enter__.return_value.read.return_value = b"x" * (5 * 1024 * 1024 + 1)
        with patch("companion.runner.urllib.request.build_opener", return_value=opener):
            with self.assertRaises(ValueError):
                runner.snapshot("semantic")

    def test_disabled_and_failed_schedule(self):
        self.runner.set_schedules(
            [
                dict(
                    id="disabled",
                    sourceId="demo",
                    enabled=False,
                    everyMinutes=1,
                    dryRun=True,
                )
            ]
        )
        self.assertEqual(self.runner.tick(time.time() + 10000), 0)
        self.runner.set_schedules(
            [
                dict(
                    id="broken",
                    sourceId="demo",
                    enabled=True,
                    everyMinutes=1,
                    dryRun=True,
                )
            ]
        )
        due = self.runner.schedules()[0]["nextRunAt"]
        with patch.object(
            self.runner, "snapshot", side_effect=ValueError("private-secret")
        ):
            self.assertEqual(self.runner.tick(due), 1)
        self.assertEqual(self.runner.logs()[0]["status"], "error")
        self.assertNotIn("private-secret", json.dumps(self.runner.logs()))

    def test_replay_persists(self):
        raw = json.dumps(
            dict(
                eventId="persist",
                type="pipeline.success",
                occurredAt="2026-01-01T00:00:00Z",
                sourceId="demo",
                payload={},
            )
        ).encode()
        stamp = str(int(time.time()))
        sig = hmac.new(
            b"b" * 32, stamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
        self.runner.event(raw, stamp, sig)
        with self.assertRaises(ValueError):
            Runner(self.config).event(raw, stamp, sig)

    def test_readonly_sqlite(self):
        warehouse = self.path / "warehouse.db"
        db = sqlite3.connect(warehouse)
        try:
            with db:
                db.execute("CREATE TABLE facts (" + ",".join(ROW) + ")")
                db.execute(
                    "INSERT INTO facts VALUES (" + ",".join("?" for _ in ROW) + ")",
                    list(ROW.values()),
                )
        finally:
            db.close()
        runner = Runner(
            dict(
                self.config,
                sources=[
                    dict(id="warehouse", type="sqlite", readOnlyDatabase=str(warehouse))
                ],
            )
        )
        self.assertEqual(runner.snapshot("warehouse")["rows"][0], ROW)

    def test_readonly_sqlite_rejects_missing_dimension_column(self):
        warehouse = self.path / "missing-product.db"
        fields = [field for field in ROW if field != "product"]
        db = sqlite3.connect(warehouse)
        try:
            with db:
                db.execute("CREATE TABLE facts (" + ",".join(fields) + ")")
                db.execute(
                    "INSERT INTO facts VALUES (" + ",".join("?" for _ in fields) + ")",
                    [ROW[field] for field in fields],
                )
        finally:
            db.close()
        runner = Runner(dict(self.config, sources=[dict(
            id="warehouse", type="sqlite", readOnlyDatabase=str(warehouse),
        )]))
        with self.assertRaisesRegex(sqlite3.OperationalError, "no such column"):
            runner.snapshot("warehouse")

    def test_postgres_mock(self):
        db = MagicMock()
        db.__enter__.return_value = db
        cur = MagicMock()
        db.cursor.return_value.__enter__.return_value = cur
        cur.fetchmany.return_value = [list(ROW.values())]
        psycopg = types.SimpleNamespace(connect=MagicMock(return_value=db))
        runner = Runner(
            dict(
                self.config,
                sources=[
                    dict(
                        id="pg",
                        type="postgresql",
                        dsnEnv="TEST_LEDGERLINE_DSN",
                        table="facts",
                    )
                ],
            )
        )
        with patch.dict(sys.modules, psycopg=psycopg), patch.dict(
            "os.environ", TEST_LEDGERLINE_DSN="private-dsn"
        ):
            self.assertEqual(runner.snapshot("pg")["rows"][0], ROW)
        self.assertIn(
            "SET TRANSACTION READ ONLY", [c.args[0] for c in cur.execute.call_args_list]
        )
        self.assertIn(
            "SET LOCAL statement_timeout = '10000ms'",
            [c.args[0] for c in cur.execute.call_args_list],
        )

    def test_outbound_signature_and_dryrun(self):
        runner = Runner(
            dict(
                self.config, webhook="http://127.0.0.1:8766", allowLoopbackWebhook=True
            )
        )
        opener = MagicMock()
        with patch("companion.runner.urllib.request.build_opener", return_value=opener):
            runner.run("demo", True)
            opener.open.assert_not_called()
            runner.run("demo", False)
        req = opener.open.call_args.args[0]
        ts = req.get_header("X-ledgerline-timestamp")
        sig = req.get_header("X-ledgerline-signature")
        self.assertEqual(
            sig,
            hmac.new(
                b"b" * 32, ts.encode() + b"." + req.data, hashlib.sha256
            ).hexdigest(),
        )
        with self.assertRaises(ValueError):
            Runner(dict(self.config, webhook="http://127.0.0.1:8766"))
        with patch.object(
            runner, "snapshot", side_effect=ValueError("secret")
        ), patch.object(runner, "deliver") as deliver:
            with self.assertRaises(ValueError):
                runner.run("demo", True)
            deliver.assert_not_called()
        self.assertTrue(list(self.path.glob("exports/failure-*.webhook.json")))

    def test_http(self):
        server = create_server(self.runner, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_port)
        try:
            self.assertTrue(json.load(urllib.request.urlopen(base + "/health"))["ok"])
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(base + "/api/sources")
            self.assertEqual(e.exception.code, 401)
            e.exception.close()
            req = urllib.request.Request(
                base + "/api/snapshot?source=demo",
                headers={
                    "Authorization": "Bearer " + "a" * 32,
                    "Origin": "http://localhost:8000",
                },
            )
            with urllib.request.urlopen(req) as r:
                self.assertEqual(
                    r.headers["Access-Control-Allow-Origin"], "http://localhost:8000"
                )
                self.assertEqual(json.load(r)["sourceId"], "demo")
            req = urllib.request.Request(
                base + "/api/sources",
                headers={
                    "Authorization": "Bearer " + "a" * 32,
                    "Origin": "https://evil.test",
                },
            )
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(req)
            self.assertEqual(e.exception.code, 403)
            e.exception.close()
            req = urllib.request.Request(
                base + "/api/schedules",
                method="PUT",
                data=json.dumps(
                    {
                        "schedules": [
                            dict(
                                id="test",
                                sourceId="demo",
                                enabled=False,
                                everyMinutes=5,
                                dryRun=True,
                            )
                        ]
                    }
                ).encode(),
                headers={
                    "Authorization": "Bearer " + "a" * 32,
                    "Content-Type": "application/json",
                },
            )
            self.assertEqual(
                json.load(urllib.request.urlopen(req))["schedules"][0]["id"], "test"
            )
            req = urllib.request.Request(
                base + "/api/schedules",
                method="OPTIONS",
                headers={
                    "Origin": "http://localhost:8000",
                    "Access-Control-Request-Headers": "Authorization",
                },
            )
            with urllib.request.urlopen(req) as r:
                self.assertEqual(r.status, 204)
            req = urllib.request.Request(
                base + "/companion/runner.py",
                headers={"Authorization": "Bearer " + "a" * 32},
            )
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(req)
            self.assertEqual(e.exception.code, 404)
            e.exception.close()
            req = urllib.request.Request(
                base + "/api/run",
                method="POST",
                data=b"{broken",
                headers={"Authorization": "Bearer " + "a" * 32},
            )
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(req)
            self.assertEqual(e.exception.code, 400)
            self.assertNotIn("a" * 32, e.exception.read().decode())
            e.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
