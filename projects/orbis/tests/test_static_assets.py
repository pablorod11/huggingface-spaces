"""Exercise public startup assets and the private-path boundary over HTTP."""
import json
import re
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from types import SimpleNamespace
from companion.runner import create_server


class StaticAssetsTests(unittest.TestCase):
    def setUp(self):
        self.token = "static-asset-fixture-token"
        runner = SimpleNamespace(config={"token": self.token, "allowedOrigins": []})
        self.server = create_server(runner, port=0)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.base = "http://127.0.0.1:" + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)

    def get(self, path, authenticated=False):
        request = urllib.request.Request(self.base + path)
        if authenticated:
            request.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.read()

    def test_startup_assets_are_public_and_contract_json_is_valid(self):
        status, index = self.get("/")
        self.assertEqual(status, 200)
        pending = [urllib.parse.urljoin("/", path) for path in
                   re.findall(r'(?:src|href)="(\./src/[^\"]+)"', index.decode())]
        pending += ["/data/infrastructure.csv", "/data/contracts.example.json"]
        visited = set()
        while pending:
            path = pending.pop()
            if path in visited:
                continue
            visited.add(path)
            with self.subTest(path=path):
                status, body = self.get(path)
                self.assertEqual(status, 200, "Startup asset must not require bearer auth")
                self.assertTrue(body)
                if path == "/data/contracts.example.json":
                    self.assertIsInstance(json.loads(body), list)
                if urllib.parse.urlparse(path).path.endswith(".js"):
                    pending.extend(urllib.parse.urljoin(path, imported) for imported in
                        re.findall(r'(?:from\s*|import\s*)[\"\'](\./[^\"\']+)[\"\']', body.decode()))
        self.assertIn("/src/app.js", {urllib.parse.urlparse(path).path for path in visited})
        self.assertIn("/src/styles.css", {urllib.parse.urlparse(path).path for path in visited})

    def test_private_and_traversal_paths_are_not_public_assets(self):
        for path in ("/companion/config.example.json", "/companion/config.local.json",
                     "/companion/state/state.db", "/companion/runner.py", "/.git/config",
                     "/src/../companion/config.local.json",
                     "/src/%2e%2e/companion/config.local.json",
                     "/data/../companion/config.local.json"):
            for authenticated in (False, True):
                with self.subTest(path=path, authenticated=authenticated):
                    status, _ = self.get(path, authenticated)
                    self.assertIn(status, (401, 404))

    def test_brand_assets_and_font_are_public_without_broadening_asset_paths(self):
        for path in ("/assets/favicon.svg", "/assets/orbis.svg", "/assets/fonts/Manrope.ttf"):
            with self.subTest(path=path):
                status, body = self.get(path)
                self.assertEqual(status, 200)
                self.assertTrue(body)
        for path in ("/assets/../companion/runner.py", "/assets/fonts/../../companion/runner.py"):
            status, _ = self.get(path)
            self.assertIn(status, (401, 404))
