"""Receiver deadlines apply during headers while signatures and replay checks remain intact."""
import hashlib
import hmac
import io
import json
import socket
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
from companion.receiver import create_receiver
from companion.runner import Runner


class ReceiverLimitsTests(unittest.TestCase):
    def test_timeout_is_installed_before_reading_request_headers(self):
        class ReachedRead(Exception):
            pass

        timeout_calls = []
        case = self

        class HeaderStream(io.BytesIO):
            def readline(self, *args):
                case.assertEqual(timeout_calls, [15], "Header read must have an idle deadline")
                raise ReachedRead()

        class Request:
            def settimeout(self, value):
                timeout_calls.append(value)

            def makefile(self, *args):
                return HeaderStream()

            def sendall(self, data):
                pass

        with patch("companion.receiver.HTTPServer", side_effect=lambda address, handler: handler):
            handler = create_receiver(object(), port=0)
        with self.assertRaises(ReachedRead):
            handler(Request(), ("127.0.0.1", 1), object())

    def test_idle_partial_headers_release_signed_delivery_without_client_close(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = Runner(dict(
                token="receiver-fixture-token-value", eventSecret="receiver-fixture-event-secret",
                database=str(Path(directory) / "state.db"),
                outputDir=str(Path(directory) / "exports"),
                sources=[dict(id="fixture", type="sqlite")],
            ))
            server = create_receiver(runner, port=0)
            # Scale the deadline for a bounded regression; the other test exercises
            # the production handler's unmodified timeout before its first read.
            server.RequestHandlerClass.timeout = 0.15
            accepted = threading.Event()
            original_get_request = server.get_request

            def get_request():
                request = original_get_request()
                accepted.set()
                return request

            server.get_request = get_request
            worker = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
            worker.start()
            slow = None
            raw = json.dumps({"type": "fixture"}).encode()
            stamp = str(int(time.time()))
            signature = hmac.new(runner.config["eventSecret"].encode(), stamp.encode() + b"." + raw, hashlib.sha256).hexdigest()

            def post(signature_value):
                request = urllib.request.Request(
                    "http://127.0.0.1:" + str(server.server_port), data=raw,
                    headers={"X-Ledgerline-Timestamp": stamp, "X-Ledgerline-Signature": signature_value},
                    method="POST",
                )
                return urllib.request.urlopen(request, timeout=2)

            try:
                slow = socket.create_connection(server.server_address, timeout=1)
                slow.sendall(b"POST / HTTP/1.1\r\nHost: localhost\r\nX-Incomplete: ")
                self.assertTrue(accepted.wait(1))
                with post(signature) as response:
                    self.assertEqual(response.status, 204)
                # The slow client remains open; server timeout, not client release,
                # must have allowed the queued signed request through.
                self.assertNotEqual(slow.fileno(), -1)
                for invalid_signature in (signature, "0" * 64):
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        post(invalid_signature)
                    with error.exception:
                        self.assertEqual(error.exception.code, 400)
                with runner.connect() as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM events").fetchone()[0], 1)
            finally:
                if slow is not None:
                    slow.close()
                server.shutdown()
                server.server_close()
                worker.join(timeout=2)
