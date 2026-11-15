"""Local signed webhook receiver. Writes accepted payloads to a private local file."""

import argparse, json, pathlib
from http.server import BaseHTTPRequestHandler, HTTPServer
from .runner import Runner


def create_receiver(runner, port=8766):
    class Receiver(BaseHTTPRequestHandler):
        timeout = 15

        def log_message(self, *args):
            pass

        def do_POST(self):
            import hashlib, hmac, time, sqlite3

            try:
                n = int(self.headers.get("Content-Length", "0"))
                if not 0 < n <= 5 * 1024 * 1024:
                    raise ValueError()
                raw = self.rfile.read(n)
                stamp = self.headers.get("X-Ledgerline-Timestamp", "")
                sig = self.headers.get("X-Ledgerline-Signature", "")
                if abs(time.time() - int(stamp)) > 300:
                    raise ValueError()
                expected = hmac.new(
                    runner.config["eventSecret"].encode(),
                    stamp.encode() + b"." + raw,
                    hashlib.sha256,
                ).hexdigest()
                if not hmac.compare_digest(expected, sig):
                    raise ValueError()
                payload = json.loads(raw)
                # Persist signed-body identity before acknowledgment to reject retries.
                with runner.connect() as db:
                    db.execute(
                        "INSERT INTO events VALUES(?,?)",
                        (
                            "receiver-"
                            + hashlib.sha256(stamp.encode() + b"." + raw).hexdigest(),
                            json.dumps(payload),
                        ),
                    )
                self.send_response(204)
                self.end_headers()
            except (ValueError, sqlite3.IntegrityError):
                self.send_response(400)
                self.end_headers()

    return HTTPServer(("127.0.0.1", port), Receiver)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    p.add_argument("--port", type=int, default=8766)
    args = p.parse_args()
    runner = Runner(json.loads(pathlib.Path(args.config).read_text()))
    create_receiver(runner, args.port).serve_forever()


if __name__ == "__main__":
    main()
