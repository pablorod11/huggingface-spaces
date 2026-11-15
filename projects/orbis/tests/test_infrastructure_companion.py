import csv, json, pathlib, sqlite3, tempfile, unittest
from companion.infrastructure import FIELDS, validate_rows, summarize, quality
from companion.runner import Runner

ROW = dict(
    zip(
        FIELDS,
        [
            "=SUM(1)",
            "2026-11-02T00:00:00Z",
            24,
            "production",
            "aws",
            "us-east-1",
            "enterprise",
            100,
            2,
            100,
            20,
            5,
            3,
            2,
            100,
            20,
            200,
            100,
            500,
            250,
            1000,
            20,
            15,
            0.99,
        ],
    )
)


class InfrastructureTests(unittest.TestCase):
    def test_normalization_and_rates(self):
        self.assertEqual(validate_rows([dict(ROW, transactions="100")])[0], ROW)
        s = summarize([ROW, dict(ROW, id="b", cpuCapacityHours=300, cpuUsedHours=240)])
        for key, value in dict(
            cpuUtilization=65,
            totalCost=60,
            costPerTransaction=0.3,
            successRate=98,
            avgLatencyMs=10,
            commitmentUtilization=75,
            commitmentCoverage=75,
            slaMet=False,
        ).items():
            self.assertEqual(s[key], value)
        self.assertIsNone(summarize([])["margin"])
        self.assertEqual(
            summarize([dict(ROW, cpuUsedHours=85)])["saturatedIntervals"], 1
        )
        self.assertEqual(
            summarize([dict(ROW, cpuUsedHours=84.99)])["saturatedIntervals"], 0
        )

    def test_commitment_invoice_reconciliation(self):
        for budget in (100, 10 + 2e-6):
            with self.subTest(budget=budget), self.assertRaisesRegex(
                ValueError, "committedCost"
            ):
                validate_rows([
                    dict(ROW, computeCost=10, committedCost=budget, coveredCost=0)
                ])
        for invoice, budget in ((10, 10 + 1e-6), (20, 20)):
            with self.subTest(invoice=invoice, budget=budget):
                row = dict(ROW, computeCost=invoice, committedCost=budget, coveredCost=0)
                self.assertEqual(validate_rows([row]), [row])
                summary = summarize([row])
                self.assertEqual(summary["totalCost"], invoice + 10)
                self.assertEqual(summary["commitmentUtilization"], 0)

    def test_invalid_fields_intervals_and_allocations(self):
        for changes in [
            dict(provider="oracle"),
            dict(region="eastus"),
            dict(timestamp="2026-11-02"),
            dict(hours=2),
            dict(hours=1, timestamp="2026-11-02T00:30:00Z"),
            dict(hours=1, timestamp="2026-11-02T00:00:01Z"),
            dict(timestamp="2026-11-02T01:00:00Z"),
            dict(errors=101),
            dict(transactions=1.5),
            dict(cpuUsedHours=101),
            dict(memoryUsedGbHours=201),
            dict(storageUsedGbHours=501),
            dict(coveredCost=21),
            dict(committedCost=10),
            dict(slaTarget=1.1),
            dict(revenue=True),
            dict(revenue=float("nan")),
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_rows([dict(ROW, **changes)])
        for rows in [
            [ROW, ROW],
            [ROW, dict(ROW, id="b", hours=1, timestamp="2026-11-02T12:00:00Z")],
            [ROW, dict(ROW, id="b", timestamp="2023-11-02T00:00:00Z")],
        ]:
            with self.assertRaises(ValueError):
                validate_rows(rows)
        self.assertEqual(len(validate_rows([ROW, dict(ROW, id="b", tier="free")])), 2)
        self.assertEqual(
            len(
                validate_rows(
                    [ROW, dict(ROW, id="b", timestamp="2026-11-03T00:00:00Z")]
                )
            ),
            2,
        )

    def test_limits_and_quality(self):
        with self.assertRaises(ValueError):
            validate_rows([ROW] * 100001)
        with self.assertRaises(ValueError):
            validate_rows([ROW, dict(ROW, id="b", timestamp="2024-10-26T00:00:00Z")])
        status = {
            q["id"]: q["status"] for q in quality([ROW], now="2026-11-20T00:00:00Z")
        }
        self.assertEqual(status["freshness"], "warn")
        self.assertEqual(status["allocation"], "pass")

        def fresh(rows=[ROW], fetchedAt=None):
            return quality(rows, now="2026-11-03T01:00:00Z", fetchedAt=fetchedAt)[-1][
                "status"
            ]

        self.assertEqual(fresh(fetchedAt="2026-11-03T00:50:00Z"), "pass")
        self.assertEqual(fresh([dict(ROW, timestamp="2027-01-01T00:00:00Z")]), "warn")
        for stamp in ["2026-11-01T00:00:00Z", "2026-11-03T01:06:00Z", "malformed"]:
            self.assertEqual(fresh(fetchedAt=stamp), "warn")

    def test_snapshot_exports_readonly(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp)
            seed = path / "infra.csv"
            with seed.open("w") as f:
                w = csv.DictWriter(f, fieldnames=FIELDS)
                w.writeheader()
                w.writerow(ROW)
            config = dict(
                token="a" * 32,
                eventSecret="b" * 32,
                database=str(path / "state.db"),
                outputDir=str(path / "exports"),
                sources=[
                    dict(
                        id="infra",
                        type="sqlite",
                        schema="infrastructure-v1",
                        csv=str(seed),
                    )
                ],
            )
            r = Runner(config)
            snap = r.snapshot("infra")
            self.assertEqual(snap["schemaVersion"], "infrastructure-v1")
            self.assertEqual(snap["dataThrough"], "2026-11-03T00:00:00Z")
            result = r.run("infra")
            self.assertEqual(result["digest"]["totalCost"], 30)
            self.assertEqual(result["digest"]["contribution"], 70)
            with open(result["files"][0]) as f:
                reader = csv.reader(f)
                self.assertEqual(next(reader), FIELDS)
                self.assertEqual(next(reader)[0], "'=SUM(1)")
            warehouse = path / "warehouse.db"
            with sqlite3.connect(warehouse) as db:
                db.execute("CREATE TABLE facts (" + ",".join(FIELDS) + ")")
                db.execute(
                    "INSERT INTO facts VALUES (" + ",".join("?" for _ in FIELDS) + ")",
                    list(ROW.values()),
                )
            config["sources"] = [
                dict(
                    id="infra",
                    type="sqlite",
                    schema="infrastructure-v1",
                    readOnlyDatabase=str(warehouse),
                )
            ]
            self.assertEqual(Runner(config).snapshot("infra")["rows"][0], ROW)
            config["sources"][0]["schema"] = "unknown"
            with self.assertRaises(ValueError):
                Runner(config)
        self.assertEqual(
            [q for q in quality([ROW], mode="demo") if q["id"] == "freshness"][0][
                "status"
            ],
            "info",
        )


class InfrastructureConnectorTests(unittest.TestCase):
    def test_semantic_postgres_and_http(self):
        import datetime as dt, sys, types, threading, urllib.request
        from unittest.mock import patch, MagicMock
        from companion.runner import create_server

        with tempfile.TemporaryDirectory() as tmp:
            config = dict(
                token="a" * 32,
                eventSecret="b" * 32,
                database=tmp + "/state.db",
                outputDir=tmp + "/exports",
                sources=[
                    dict(
                        id="infra",
                        type="semantic",
                        schema="infrastructure-v1",
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
            with patch(
                "companion.runner.urllib.request.build_opener", return_value=opener
            ):
                self.assertEqual(runner.snapshot("infra")["rows"][0], ROW)
            db = MagicMock()
            db.__enter__.return_value = db
            cur = MagicMock()
            db.cursor.return_value.__enter__.return_value = cur
            values = list(ROW.values())
            values[1] = dt.datetime(2026, 11, 2, tzinfo=dt.timezone.utc)
            cur.fetchmany.return_value = [values]
            config["sources"] = [
                dict(
                    id="infra",
                    type="postgresql",
                    schema="infrastructure-v1",
                    dsnEnv="TEST_INFRA_DSN",
                )
            ]
            runner = Runner(config)
            with patch.dict(
                sys.modules,
                psycopg=types.SimpleNamespace(connect=MagicMock(return_value=db)),
            ), patch.dict("os.environ", TEST_INFRA_DSN="private"):
                self.assertEqual(runner.snapshot("infra")["rows"][0], ROW)
            self.assertEqual(cur.fetchmany.call_args.args[0], 100001)
            self.assertIn('"computeCost"', cur.execute.call_args.args[0])
            config["sources"] = [
                dict(id="infra", type="sqlite", schema="infrastructure-v1")
            ]
            runner = Runner(config)
            with runner.connect() as database:
                database.execute(
                    "INSERT INTO facts VALUES (?,?,?)",
                    ("infra", ROW["id"], json.dumps(ROW)),
                )
            server = create_server(runner, port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                req = urllib.request.Request(
                    "http://127.0.0.1:" + str(server.server_port) + "/api/snapshot",
                    headers={"Authorization": "Bearer " + "a" * 32},
                )
                with urllib.request.urlopen(req) as r:
                    self.assertEqual(json.load(r)["schemaVersion"], "infrastructure-v1")
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
