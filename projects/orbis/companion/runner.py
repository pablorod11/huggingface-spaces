"""Owner-configured, loopback-only-by-default data companion."""

from contextlib import contextmanager
import argparse, csv, datetime as dt, hashlib, hmac, html, io, json, math, os, pathlib, re, sqlite3, time, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import infrastructure as infra

FIELDS = (
    "id date region country channel category product revenue cost orders units".split()
)
LIMIT = 5 * 1024 * 1024
ROOT = pathlib.Path(__file__).resolve().parent.parent


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def validate_rows(rows):
    if not isinstance(rows, list) or len(rows) > 50000:
        raise ValueError("Expected at most 50000 rows")
    seen = set()
    result = []
    for i, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise ValueError("Expected row object")
        out = {}
        for field in FIELDS:
            v = row.get(field)
            if field in FIELDS[:7]:
                if not isinstance(v, str) or not v.strip():
                    raise ValueError(f"Row {i}: invalid {field}")
                out[field] = v
            else:
                if isinstance(v, bool):
                    raise ValueError("Invalid boolean number")
                try:
                    n = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"Row {i}: invalid {field}") from None
                if (
                    not math.isfinite(n)
                    or n < 0
                    or (field in ("orders", "units") and not n.is_integer())
                ):
                    raise ValueError(f"Row {i}: invalid {field}")
                out[field] = int(n) if field in ("orders", "units") else n
        if dt.date.fromisoformat(out["date"]).isoformat() != out["date"]:
            raise ValueError("Invalid date")
        if out["id"] in seen:
            raise ValueError("Duplicate ID")
        seen.add(out["id"])
        result.append(out)
    if result:
        dates = [dt.date.fromisoformat(row["date"]) for row in result]
        if (max(dates) - min(dates)).days > 7310:
            raise ValueError("Source date span exceeds 7310 days")
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Redirects disabled")


def https_url(url):
    p = urllib.parse.urlparse(url or "")
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.fragment:
        raise ValueError("Endpoint requires HTTPS without credentials")
    return url


class Runner:
    def __init__(self, config):
        self.config = config
        for key in ("token", "eventSecret"):
            if not isinstance(config.get(key), str) or len(config[key]) < 24:
                raise ValueError("Choose secrets at least 24 characters long")
        if not isinstance(config.get("allowedOrigins", []), list):
            raise ValueError("Origins must be list")
        for origin in config.get("allowedOrigins", []):
            p = urllib.parse.urlparse(origin)
            if (
                p.scheme not in ("http", "https")
                or not p.netloc
                or p.path
                or p.query
                or p.fragment
                or p.username
                or "*" in origin
            ):
                raise ValueError("Use exact origins without trailing slash")
        self.sources = {}
        for s in config.get("sources", []):
            if (
                not isinstance(s, dict)
                or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", s.get("id", ""))
                or s["id"] in self.sources
                or s.get("type") not in ("sqlite", "semantic", "postgresql")
            ):
                raise ValueError("Invalid source configuration")
            if s.get("schema") not in (None, "retail-v1", infra.SCHEMA):
                raise ValueError("Unknown configured schema")
            if s["type"] == "semantic":
                https_url(s.get("url"))
            if s["type"] == "postgresql" or s.get("readOnlyDatabase"):
                if not re.fullmatch(
                    r"[A-Za-z_][A-Za-z0-9_]{0,62}", s.get("table", "facts")
                ):
                    raise ValueError("Invalid configured fact table")
            if s["type"] == "postgresql" and not s.get("dsnEnv"):
                raise ValueError("PostgreSQL requires dsnEnv")
            self.sources[s["id"]] = s
        if not self.sources:
            raise ValueError("At least one source required")
        if config.get("webhook"):
            endpoint = urllib.parse.urlparse(config["webhook"])
            if not (
                endpoint.scheme == "http"
                and config.get("allowLoopbackWebhook") is True
                and endpoint.hostname in ("127.0.0.1", "::1")
                and not endpoint.username
                and not endpoint.password
                and not endpoint.fragment
            ):
                https_url(config["webhook"])
        self.db = pathlib.Path(
            config.get("database", ROOT / "companion/state/state.db")
        )
        self.db.parent.mkdir(parents=True, exist_ok=True)
        self.output = pathlib.Path(
            config.get("outputDir", ROOT / "companion/state/exports")
        )
        self.output.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(
                "CREATE TABLE IF NOT EXISTS facts(source TEXT,id TEXT,row TEXT,PRIMARY KEY(source,id)); CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY,body TEXT,next REAL); CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY,at TEXT,source TEXT,status TEXT,detail TEXT); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE IF NOT EXISTS pipeline(source TEXT PRIMARY KEY,body TEXT);"
            )
            for sid, s in self.sources.items():
                if (
                    s["type"] == "sqlite"
                    and s.get("csv")
                    and not db.execute(
                        "SELECT 1 FROM facts WHERE source=? LIMIT 1", (sid,)
                    ).fetchone()
                ):
                    p = pathlib.Path(s["csv"])
                    if p.stat().st_size > self.schema_limit(s):
                        raise ValueError(
                            "Seed CSV exceeds configured schema size limit"
                        )
                    rows = self.validator(s)(
                        list(
                            csv.DictReader(
                                io.StringIO(p.read_text(encoding="utf-8-sig"))
                            )
                        )
                    )
                    db.executemany(
                        "INSERT INTO facts VALUES(?,?,?)",
                        [(sid, r["id"], json.dumps(r)) for r in rows],
                    )

    def operations(self):
        return dict(
            webhookConfigured=bool(self.config.get("webhook")),
            artifacts="local companion output",
            immediateRetries=False,
            schedulerMode="owner-operated",
        )

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def fields(s):
        return infra.FIELDS if s.get("schema") == infra.SCHEMA else FIELDS

    @staticmethod
    def validator(s):
        return infra.validate_rows if s.get("schema") == infra.SCHEMA else validate_rows

    @staticmethod
    def schema_limit(s):
        return infra.LIMIT if s.get("schema") == infra.SCHEMA else LIMIT

    def source(self, sid):
        if sid not in self.sources:
            raise ValueError("Unknown source ID")
        return self.sources[sid]

    def list_sources(self):
        return [
            dict(
                id=k,
                label=v.get("label", k),
                type=v["type"],
                schemaVersion=v.get("schema") or "retail-v1",
            )
            for k, v in self.sources.items()
        ]

    def snapshot(self, sid):
        s = self.source(sid)
        fields = self.fields(s)
        row_limit = infra.MAX_ROWS if s.get("schema") == infra.SCHEMA else 50000
        size_limit = self.schema_limit(s)
        if s["type"] == "postgresql":
            try:
                import psycopg
            except ImportError:
                raise ValueError("Install optional psycopg to use PostgreSQL") from None
            dsn = os.environ.get(s["dsnEnv"])
            if not dsn:
                raise ValueError("Missing PostgreSQL DSN environment variable")
            try:
                with psycopg.connect(dsn, connect_timeout=10) as db:
                    with db.cursor() as cur:
                        cur.execute("SET TRANSACTION READ ONLY")
                        cur.execute("SET LOCAL statement_timeout = '10000ms'")
                        cur.execute(
                            "SELECT "
                            + ",".join('"' + field + '"' for field in fields)
                            + " FROM "
                            + s.get("table", "facts")
                        )
                        rows = [
                            dict(zip(fields, r)) for r in cur.fetchmany(row_limit + 1)
                        ]
                        for row in rows:
                            date_field = (
                                "timestamp"
                                if s.get("schema") == infra.SCHEMA
                                else "date"
                            )
                            if isinstance(row.get(date_field), dt.datetime):
                                value = row[date_field]
                                if value.tzinfo is None:
                                    raise ValueError(
                                        "Warehouse timestamp requires timezone"
                                    )
                                row[date_field] = value.astimezone(
                                    dt.timezone.utc
                                ).strftime("%Y-%m-%dT%H:%M:%SZ")
                            elif isinstance(row.get(date_field), dt.date):
                                row[date_field] = row[date_field].isoformat()
            except Exception:
                raise ValueError(
                    "PostgreSQL read failed; verify environment DSN, read permissions and normalized table"
                ) from None
        elif s["type"] == "sqlite":
            if s.get("readOnlyDatabase"):
                db = sqlite3.connect(
                    pathlib.Path(s["readOnlyDatabase"]).resolve().as_uri() + "?mode=ro",
                    uri=True,
                    timeout=10,
                )
                started = time.monotonic()
                try:
                    db.set_progress_handler(
                        lambda: int(time.monotonic() - started > 10), 1000
                    )
                    rows = [
                        dict(zip(fields, r))
                        for r in db.execute(
                            "SELECT "
                            + ",".join('fact."' + field + '"' for field in fields)
                            + " FROM "
                            + s.get("table", "facts")
                            + " AS fact"
                        ).fetchmany(row_limit + 1)
                    ]
                finally:
                    db.close()
            else:
                with self.connect() as db:
                    rows = [
                        json.loads(r[0])
                        for r in db.execute(
                            "SELECT row FROM facts WHERE source=? ORDER BY id", (sid,)
                        ).fetchmany(row_limit + 1)
                    ]
        else:
            headers = {"Accept": "application/json"}
            if s.get("headerEnv"):
                secret = os.environ.get(s["headerEnv"])
                if not secret:
                    raise ValueError("Missing semantic credential environment variable")
                headers[s.get("headerName", "Authorization")] = secret
            try:
                with urllib.request.build_opener(NoRedirect).open(
                    urllib.request.Request(s["url"], headers=headers), timeout=10
                ) as r:
                    raw = r.read(size_limit + 1)
                if len(raw) > size_limit:
                    raise ValueError("Semantic response exceeds limit")
                rows = json.loads(raw)["rows"]
            except Exception:
                raise ValueError(
                    "Semantic endpoint failed; check endpoint, credentials and schema"
                ) from None
        rows = self.validator(s)(rows)
        with self.connect() as db:
            p = db.execute(
                "SELECT body FROM pipeline WHERE source=?", (sid,)
            ).fetchone()
        return dict(
            sourceId=sid,
            schemaVersion=s.get("schema") or "retail-v1",
            fetchedAt=utc(),
            dataThrough=(
                infra.data_through(rows)
                if s.get("schema") == infra.SCHEMA
                else max((r["date"] for r in rows), default=None)
            ),
            rows=rows,
            pipelineStatus=(
                json.loads(p[0])
                if p
                else dict(
                    status="unknown",
                    lastSuccess=None,
                    message="No pipeline events received",
                )
            ),
        )

    def log(self, sid, status, message):
        with self.connect() as db:
            db.execute(
                "INSERT INTO logs(at,source,status,detail) VALUES(?,?,?,?)",
                (utc(), sid, status, message),
            )

    def logs(self):
        with self.connect() as db:
            return [
                dict(id=r[0], at=r[1], sourceId=r[2], status=r[3], message=r[4])
                for r in db.execute("SELECT * FROM logs ORDER BY id DESC LIMIT 100")
            ]

    def run(self, sid, dry_run=True):
        try:
            snap = self.snapshot(sid)
            rows = snap["rows"]
            source = self.source(sid)
            if source.get("schema") == infra.SCHEMA:
                digest = dict(
                    sourceId=sid,
                    schemaVersion=infra.SCHEMA,
                    generatedAt=utc(),
                    dataThrough=snap["dataThrough"],
                    rowCount=len(rows),
                    **infra.summarize(rows),
                )
                quality = infra.quality(
                    rows, mode=source.get("mode", "live"), fetchedAt=snap["fetchedAt"]
                )
                stale = any(q["status"] == "warn" for q in quality)
                threshold_alert = digest["slaMet"] is False or (
                    digest["peakCpuUtilization"] is not None
                    and digest["peakCpuUtilization"] >= 85
                )
            else:
                revenue = sum(r["revenue"] for r in rows)
                cost = sum(r["cost"] for r in rows)
                digest = dict(
                    sourceId=sid,
                    generatedAt=utc(),
                    dataThrough=snap["dataThrough"],
                    rowCount=len(rows),
                    revenue=revenue,
                    cost=cost,
                    profit=revenue - cost,
                    margin=100 * (revenue - cost) / revenue if revenue else None,
                )
                stale = (
                    not snap["dataThrough"]
                    or (
                        dt.datetime.now(dt.timezone.utc).date()
                        - dt.date.fromisoformat(snap["dataThrough"])
                    ).days
                    > 7
                )
                quality = [
                    dict(
                        id="schema",
                        status="pass",
                        affected=0,
                        message="Fact schema valid",
                    ),
                    dict(
                        id="freshness",
                        status="warn" if stale else "pass",
                        affected=len(rows),
                        message="Data-through checked against runner UTC date",
                    ),
                ]
                threshold_alert = False
            try:
                json.dumps(digest, allow_nan=False)
            except ValueError:
                raise ValueError("Digest contains non-finite aggregate values") from None
            prefix = self.output / (sid + "-" + str(time.time_ns()))
            files = []
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=self.fields(source))
            w.writeheader()
            for row in rows:
                w.writerow(
                    {
                        k: (
                            "'" + v
                            if isinstance(v, str)
                            and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
                            else v
                        )
                        for k, v in row.items()
                    }
                )
            payload = dict(
                type=(
                    "quality.alert"
                    if stale
                    else "threshold.alert" if threshold_alert else "digest"
                ),
                digest=digest,
                quality=quality,
            )
            for ext, body in [
                ("csv", buf.getvalue()),
                ("json", json.dumps(snap, indent=2)),
                (
                    "html",
                    '<!doctype html><meta charset="utf-8"><title>Orbis digest</title><h1>Orbis digest</h1><pre>'
                    + html.escape(json.dumps(digest, indent=2))
                    + "</pre>",
                ),
                ("webhook.json", json.dumps(payload, indent=2)),
            ]:
                p = pathlib.Path(str(prefix) + "." + ext)
                p.write_text(body, encoding="utf-8")
                files.append(str(p))
            if not dry_run:
                self.deliver(payload)
            self.log(
                sid,
                "success",
                "Dry-run exports written" if dry_run else "Exports written",
            )
            return dict(status="success", files=files, quality=quality, digest=digest)
        except Exception:
            safe_sid = (
                sid if isinstance(sid, str) and sid in self.sources else "invalid"
            )
            payload = dict(
                type="run.failed",
                sourceId=safe_sid,
                schemaVersion=self.sources.get(safe_sid, {}).get("schema")
                or "retail-v1",
                occurredAt=utc(),
                message="Run failed; inspect local source configuration",
            )
            (
                self.output / ("failure-" + str(time.time_ns()) + ".webhook.json")
            ).write_text(json.dumps(payload), encoding="utf-8")
            self.log(
                safe_sid,
                "error",
                "Run failed; check source configuration and connectivity",
            )
            if not dry_run:
                try:
                    self.deliver(payload)
                except Exception:
                    self.log(safe_sid, "error", "Failure alert delivery failed")
            raise

    def deliver(self, payload):
        if not self.config.get("webhook"):
            return
        raw = json.dumps(payload, separators=(",", ":")).encode()
        ts = str(int(time.time()))
        sig = hmac.new(
            self.config["eventSecret"].encode(),
            ts.encode() + b"." + raw,
            hashlib.sha256,
        ).hexdigest()
        req = urllib.request.Request(
            self.config["webhook"],
            data=raw,
            headers={
                "Content-Type": "application/json",
                "X-Ledgerline-Timestamp": ts,
                "X-Ledgerline-Signature": sig,
            },
            method="POST",
        )
        try:
            with urllib.request.build_opener(NoRedirect).open(
                req, timeout=10
            ) as response:
                response.read(1024)
        except Exception:
            raise ValueError("Configured webhook delivery failed") from None

    def schedules(self):
        with self.connect() as db:
            return [
                dict(json.loads(r[0]), nextRunAt=r[1])
                for r in db.execute("SELECT body,next FROM schedules ORDER BY id")
            ]

    def set_schedules(self, items):
        if not isinstance(items, list) or len(items) > 50:
            raise ValueError("Expected at most 50 schedules")
        seen = set()
        for s in items:
            if (
                not isinstance(s, dict)
                or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", s.get("id", ""))
                or s["id"] in seen
            ):
                raise ValueError("Invalid schedule ID")
            seen.add(s["id"])
            self.source(s.get("sourceId"))
            n = s.get("everyMinutes")
            if (
                type(n) != int
                or not 1 <= n <= 525600
                or type(s.get("enabled")) != bool
                or type(s.get("dryRun")) != bool
            ):
                raise ValueError("Invalid interval or booleans")
        old = {s["id"]: s for s in self.schedules()}
        with self.connect() as db:
            db.execute("DELETE FROM schedules")
            for s in items:
                body = {
                    k: s[k]
                    for k in ("id", "sourceId", "enabled", "everyMinutes", "dryRun")
                }
                prior = old.get(s["id"])
                nxt = (
                    prior["nextRunAt"]
                    if prior and all(prior[k] == body[k] for k in body)
                    else time.time() + body["everyMinutes"] * 60
                )
                db.execute(
                    "INSERT INTO schedules VALUES(?,?,?)",
                    (s["id"], json.dumps(body), nxt),
                )
        return self.schedules()

    def tick(self, now=None):
        now = time.time() if now is None else now
        count = 0
        for s in self.schedules():
            if not s["enabled"] or s["nextRunAt"] > now:
                continue
            with self.connect() as db:
                claimed = db.execute(
                    "UPDATE schedules SET next=? WHERE id=? AND next=?",
                    (now + s["everyMinutes"] * 60, s["id"], s["nextRunAt"]),
                ).rowcount
            if claimed:
                count += 1
                try:
                    self.run(s["sourceId"], s["dryRun"])
                except Exception:
                    pass
        return count

    def event(self, raw, stamp, signature):
        if len(raw) > LIMIT:
            raise ValueError("Event exceeds limit")
        try:
            age = abs(time.time() - int(stamp))
        except (TypeError, ValueError):
            raise ValueError("Invalid timestamp") from None
        expected = hmac.new(
            self.config["eventSecret"].encode(),
            stamp.encode() + b"." + raw,
            hashlib.sha256,
        ).hexdigest()
        if age > 300 or not hmac.compare_digest(expected, signature or ""):
            raise ValueError("Invalid or stale signature")
        e = json.loads(raw)
        if (
            not isinstance(e, dict)
            or not isinstance(e.get("eventId"), str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", e["eventId"])
            or e.get("type")
            not in ("pipeline.success", "pipeline.failed", "pipeline.running")
            or not isinstance(e.get("payload"), dict)
        ):
            raise ValueError("Invalid event")
        self.source(e.get("sourceId"))
        try:
            occurred = dt.datetime.fromisoformat(e["occurredAt"].replace("Z", "+00:00"))
            if occurred.tzinfo is None:
                raise ValueError()
            occurred = occurred.astimezone(dt.timezone.utc)
        except (KeyError, TypeError, ValueError):
            raise ValueError("Invalid occurredAt") from None
        with self.connect() as db:
            # Serialize comparison and update across concurrent signed senders.
            db.execute("BEGIN IMMEDIATE")
            prev = db.execute(
                "SELECT body FROM pipeline WHERE source=?", (e["sourceId"],)
            ).fetchone()
            prev = json.loads(prev[0]) if prev else {}
            status = e["type"].split(".")[1]
            # Equal instants favor a terminal outcome, then failure over success.
            priority = {"running": 0, "success": 1, "failed": 2}
            if prev and not prev.get("occurredAt"):
                # Legacy state recorded arrival order only. Recover chronology
                # once from durable signed events, ignoring receiver payloads.
                latest = None
                last_success = prev.get("lastSuccess")
                last_success = (
                    dt.datetime.fromisoformat(last_success.replace("Z", "+00:00"))
                    if last_success else None
                )
                for (body,) in db.execute("SELECT body FROM events"):
                    old = json.loads(body)
                    if not isinstance(old, dict) or old.get("sourceId") != e["sourceId"]:
                        continue
                    if old.get("type") not in (
                        "pipeline.running", "pipeline.success", "pipeline.failed"
                    ) or not isinstance(old.get("eventId"), str):
                        continue
                    old_status = old["type"].split(".")[1]
                    try:
                        old_time = dt.datetime.fromisoformat(old["occurredAt"].replace("Z", "+00:00"))
                        if old_time.tzinfo is None:
                            continue
                        old_time = old_time.astimezone(dt.timezone.utc)
                    except (KeyError, ValueError, TypeError, AttributeError):
                        continue
                    candidate = (old_time, priority[old_status], old_status)
                    if latest is None or candidate > latest:
                        latest = candidate
                    if old_status == "success" and (last_success is None or old_time > last_success):
                        last_success = old_time
                if latest:
                    prev.update(
                        status=latest[2],
                        occurredAt=latest[0].isoformat().replace("+00:00", "Z"),
                        message="Signed pipeline." + latest[2] + " event received",
                    )
                prev["lastSuccess"] = (
                    last_success.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
                    if last_success else None
                )
            previous_time = prev.get("occurredAt") or prev.get("lastSuccess")
            previous_time = (
                dt.datetime.fromisoformat(previous_time.replace("Z", "+00:00"))
                if previous_time else None
            )
            current = previous_time is None or occurred > previous_time or (
                occurred == previous_time
                and priority[status] > priority.get(prev.get("status"), -1)
            )
            p = dict(prev)
            if current:
                p.update(
                    status=status,
                    occurredAt=occurred.isoformat().replace("+00:00", "Z"),
                    message="Signed " + e["type"] + " event received",
                )
            last_success = prev.get("lastSuccess")
            if status == "success" and (
                last_success is None or occurred > dt.datetime.fromisoformat(
                    last_success.replace("Z", "+00:00")
                )
            ):
                last_success = occurred.isoformat().replace("+00:00", "Z")
            p["lastSuccess"] = last_success
            try:
                db.execute(
                    "INSERT INTO events VALUES(?,?)", (e["eventId"], json.dumps(e))
                )
            except sqlite3.IntegrityError:
                raise ValueError("Event already received") from None
            db.execute(
                "INSERT OR REPLACE INTO pipeline VALUES(?,?)",
                (e["sourceId"], json.dumps(p)),
            )
        if current and status == "failed":
            alert = dict(
                type="pipeline.failed",
                sourceId=e["sourceId"],
                occurredAt=e["occurredAt"],
                message="Signed pipeline failure received",
            )
            (
                self.output
                / ("pipeline-failure-" + str(time.time_ns()) + ".webhook.json")
            ).write_text(json.dumps(alert), encoding="utf-8")
            if self.config.get("deliverPipelineAlerts") is True:
                try:
                    self.deliver(alert)
                except Exception:
                    self.log(
                        e["sourceId"], "error", "Pipeline failure alert delivery failed"
                    )
        return dict(status="accepted")


def create_server(runner, host="127.0.0.1", port=8765):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, *args):
            pass

        def reply(self, code, body):
            raw = json.dumps(body).encode()
            self.send_response(code)
            origin = self.headers.get("Origin")
            if origin in runner.config.get("allowedOrigins", []):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def body(self):
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ValueError("Invalid body length") from None
            if not 0 < n <= LIMIT:
                raise ValueError("Body must be 1 byte to 5 MB")
            return self.rfile.read(n)

        def handle_api(self):
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            if self.headers.get("Origin") and self.headers[
                "Origin"
            ] not in runner.config.get("allowedOrigins", []):
                return self.reply(403, dict(error="Origin is not allowed"))
            if self.command == "OPTIONS":
                self.send_response(204)
                if self.headers.get("Origin") in runner.config.get(
                    "allowedOrigins", []
                ):
                    self.send_header(
                        "Access-Control-Allow-Origin", self.headers["Origin"]
                    )
                    self.send_header("Vary", "Origin")
                self.send_header(
                    "Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS"
                )
                self.send_header(
                    "Access-Control-Allow-Headers", "Authorization, Content-Type"
                )
                self.end_headers()
                return
            if path == "/health" and self.command == "GET":
                return self.reply(200, dict(ok=True, service="ledgerline-companion"))
            try:
                if path == "/api/events" and self.command == "POST":
                    return self.reply(
                        200,
                        runner.event(
                            self.body(),
                            self.headers.get("X-Ledgerline-Timestamp"),
                            self.headers.get("X-Ledgerline-Signature"),
                        ),
                    )
                if not hmac.compare_digest(
                    self.headers.get("Authorization", ""),
                    "Bearer " + runner.config["token"],
                ):
                    return self.reply(401, dict(error="Bearer authentication required"))
                if path == "/api/sources" and self.command == "GET":
                    result = dict(
                        sources=runner.list_sources(), operations=runner.operations()
                    )
                elif path == "/api/snapshot" and self.command == "GET":
                    result = runner.snapshot(
                        urllib.parse.parse_qs(parsed.query).get(
                            "source", [next(iter(runner.sources))]
                        )[0]
                    )
                elif path == "/api/logs" and self.command == "GET":
                    result = dict(logs=runner.logs())
                elif path == "/api/schedules" and self.command == "GET":
                    result = dict(schedules=runner.schedules())
                elif path == "/api/schedules" and self.command == "PUT":
                    result = dict(
                        schedules=runner.set_schedules(
                            json.loads(self.body())["schedules"]
                        )
                    )
                elif path == "/api/run" and self.command == "POST":
                    data = json.loads(self.body())
                    if type(data.get("dryRun")) != bool:
                        raise ValueError("dryRun must be boolean")
                    result = runner.run(data.get("sourceId"), data["dryRun"])
                else:
                    return self.reply(404, dict(error="Unknown endpoint"))
                self.reply(200, result)
            except (ValueError, TypeError, KeyError, AttributeError):
                self.reply(
                    400,
                    dict(
                        error="Invalid request, signature, source or data; check local configuration"
                    ),
                )
            except Exception:
                self.reply(
                    500,
                    dict(
                        error="Companion operation failed; inspect local configuration"
                    ),
                )

        def do_GET(self):
            path = urllib.parse.urlparse(self.path).path
            if path in (
                "/",
                "/index.html",
                "/data/demo.csv",
                "/data/metrics.json",
                "/data/infrastructure.csv",
                "/data/infrastructure-metrics.json",
                "/data/contracts.example.json",
                "/assets/favicon.svg",
                "/assets/orbis.svg",
                "/assets/fonts/Manrope.ttf",
            ) or re.fullmatch(r"/src/[A-Za-z0-9_-]+\.(js|css)", path):
                file = ROOT / ("index.html" if path == "/" else path.lstrip("/"))
                if not file.is_file() or file.is_symlink():
                    return self.reply(404, dict(error="File not found"))
                raw = file.read_bytes()
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    {
                        ".html": "text/html",
                        ".js": "text/javascript",
                        ".css": "text/css",
                        ".csv": "text/csv",
                        ".json": "application/json",
                        ".svg": "image/svg+xml",
                        ".ttf": "font/ttf",
                    }[file.suffix],
                )
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            else:
                self.handle_api()

        do_POST = handle_api
        do_PUT = handle_api
        do_OPTIONS = handle_api

    return ThreadingHTTPServer((host, port), Handler)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    sub = p.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    run = sub.add_parser("run")
    run.add_argument("--source", default=None)
    run.add_argument("--deliver", action="store_true")
    sub.add_parser("tick")
    sub.add_parser("scheduler")
    args = p.parse_args()
    runner = Runner(json.loads(pathlib.Path(args.config).read_text()))
    if args.command == "serve":
        create_server(runner, args.host, args.port).serve_forever()
    elif args.command == "run":
        print(
            json.dumps(
                runner.run(args.source or next(iter(runner.sources)), not args.deliver),
                indent=2,
            )
        )
    elif args.command == "tick":
        print(json.dumps(dict(executed=runner.tick())))
    else:
        try:
            while True:
                runner.tick()
                time.sleep(10)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
