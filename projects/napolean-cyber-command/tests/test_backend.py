import json
import os
import tempfile
import time
import unittest
from pathlib import Path

from app import create_app


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config = {'TESTING': True, 'DATA_DIR': self.temp.name,
                       'APP_ACCESS_KEY': 'workspace-access-key-long-enough',
                       'SECRET_KEY': 'session-secret-key-32-characters-long',
                       'SESSION_COOKIE_SECURE': False}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.token = self.login()

    def tearDown(self):
        self.temp.cleanup()

    def login(self, client=None):
        response = (client or self.client).post('/api/login', json={'access_key': self.config['APP_ACCESS_KEY']})
        self.assertEqual(response.status_code, 200)
        return response.json['csrf_token']

    def create(self, **updates):
        payload = dict(name='Scope review', workflow='code', scope='Owned test app only',
                       authorization=True, content='eval(user_input)',
                       roles=['red', 'blue', 'white', 'black', 'purple'])
        payload.update(updates)
        return self.client.post('/api/assessments', json=payload, headers={'X-CSRF-Token': self.token})

    def test_authentication_and_csrf_protect_results_and_mutations(self):
        other = self.app.test_client()
        self.assertFalse(other.get('/api/session').json['authenticated'])
        self.assertEqual(other.get('/api/assessments').status_code, 401)
        self.assertEqual(other.get('/api/assessments/a/export').status_code, 401)
        self.assertEqual(self.client.post('/api/assessments', json={}).status_code, 403)
        self.assertEqual(self.client.post('/api/logout', headers={'X-CSRF-Token': 'wrong'}).status_code, 403)
        self.assertEqual(self.client.post('/api/logout', headers={'X-CSRF-Token': self.token}).status_code, 200)
        self.assertEqual(self.client.get('/api/assessments').status_code, 401)

    def test_login_rate_limit_expiry_and_secure_headers(self):
        other = self.app.test_client()
        for _ in range(5):
            self.assertEqual(other.post('/api/login', json={'access_key': 'incorrect'}).status_code, 401)
        self.assertEqual(other.post('/api/login', json={'access_key': 'incorrect'}).status_code, 429)
        with self.client.session_transaction() as session:
            session['expires_at'] = time.time() - 10
        self.assertEqual(self.client.get('/api/assessments').status_code, 401)
        response = self.client.get('/api/session')
        self.assertIn("default-src 'self'", response.headers['Content-Security-Policy'])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')

    def test_invalid_scope_roles_and_payloads_are_rejected(self):
        for update in ({'authorization': False}, {'authorization': 'true'}, {'scope': ''},
                       {'workflow': 'scan'}, {'roles': []}, {'roles': ['admin']},
                       {'roles': ['red', 'red']}, {'roles': ['red', {}]},
                       {'content': 3}, {'content': 'x' * 64001}, {'name': 'x' * 121}):
            with self.subTest(update=list(update)):
                self.assertEqual(self.create(**update).status_code, 400)
        for value in ([], None, 'text', 1):
            self.assertEqual(self.client.post('/api/assessments', json=value,
                             headers={'X-CSRF-Token': self.token}).status_code, 400)
        response = self.client.post('/api/assessments', data='x' * 300000,
                                   content_type='application/json', headers={'X-CSRF-Token': self.token})
        self.assertEqual(response.status_code, 413)
        self.assertIn('error', response.json)

    def test_code_candidates_are_unresolved_and_never_execute_input(self):
        marker = Path(self.temp.name) / 'executed'
        response = self.create(content=f'import subprocess\neval(user_input)\nsubprocess.run(command, shell=True)\nopen({str(marker)!r}, "w").write("bad")')
        self.assertEqual(response.status_code, 201)
        assessment = response.json['assessment']
        self.assertFalse(marker.exists())
        self.assertEqual(len(assessment['findings']), 2)
        self.assertEqual({f['verdict'] for f in assessment['findings']}, {'unresolved'})
        self.assertEqual({m['role'] for m in assessment['missions']}, {'red', 'blue', 'white', 'black', 'purple'})
        self.assertTrue(all(m['limitations'] and m['steps'] for m in assessment['missions']))
        self.assertTrue(assessment['coverage'])
        clean = self.create(content='print("hello")').json['assessment']
        self.assertEqual(clean['findings'], [])
        self.assertIn('limited', clean['summary'].lower())
        self.assertEqual(self.create(content='def bad(').status_code, 400)

    def test_secret_values_and_raw_submission_are_never_persisted(self):
        secret = 'extremely-private-secret-64388'
        raw_marker = '# RAW-SUBMISSION-NOT-STORED-77441'
        response = self.create(content=f'API_KEY = "{secret}"\n{raw_marker}\neval("{secret}")')
        self.assertEqual(response.status_code, 201)
        assessment = response.json['assessment']
        self.assertGreaterEqual(len(assessment['findings']), 2)
        self.assertNotIn(secret, response.get_data(as_text=True))
        self.assertNotIn(raw_marker, response.get_data(as_text=True))
        for file in Path(self.temp.name).iterdir():
            if file.is_file():
                self.assertNotIn(secret.encode(), file.read_bytes())
                self.assertNotIn(raw_marker.encode(), file.read_bytes())

    def test_alert_correlations_are_grouped_and_schema_is_strict(self):
        events = [{'event': 'login_failed', 'actor': 'alice', 'source_ip': '192.0.2.1'} for _ in range(5)]
        events += [{'event': 'privilege_change', 'actor': 'bob'}, {'event': 'malware_detected'}]
        assessment = self.create(workflow='alerts', content=json.dumps(events)).json['assessment']
        self.assertEqual(len(assessment['findings']), 3)
        for content in ('{}', 'invalid', '[1]', '[{"event":3}]', '[{"event":"login_failed","actor":[]}]',
                        json.dumps([{'event': 'login_failed'}] * 501), '[{"event":"x","extra":42}]'):
            self.assertEqual(self.create(workflow='alerts', content=content).status_code, 400)
        split = [{'event': 'login_failed', 'actor': str(i), 'source_ip': '192.0.2.1'} for i in range(5)]
        self.assertEqual(self.create(workflow='alerts', content=json.dumps(split)).json['assessment']['findings'], [])

    def test_exercise_generates_plans_without_inventing_findings(self):
        assessment = self.create(workflow='exercise', content='Tabletop ransomware at a fictional business').json['assessment']
        self.assertEqual(assessment['findings'], [])
        self.assertEqual(len(assessment['missions']), 5)
        single = self.create(workflow='exercise', content='A scoped tabletop', roles=['blue']).json['assessment']
        self.assertEqual([m['role'] for m in single['missions']], ['blue'])

    def test_review_persistence_export_and_deletion(self):
        assessment = self.create().json['assessment']
        aid, fid = assessment['id'], assessment['findings'][0]['id']
        path = f'/api/assessments/{aid}'
        review = path + f'/findings/{fid}'
        for payload in ({'verdict': 'confirmed-runtime', 'note': ''}, {'verdict': 'fake', 'note': 'test'},
                        {'verdict': 'confirmed-static', 'note': 'yes'}, {'verdict': 'rejected', 'note': []}):
            self.assertEqual(self.client.patch(review, json=payload, headers={'X-CSRF-Token': self.token}).status_code, 400)
        response = self.client.patch(review, json={'verdict': 'confirmed-static', 'note': 'Reviewed taint flow in owned test app.'}, headers={'X-CSRF-Token': self.token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['assessment']['findings'][0]['verdict'], 'confirmed-static')
        fresh = create_app(self.config).test_client()
        self.login(fresh)
        self.assertEqual(fresh.get(path).json['assessment']['findings'][0]['verdict'], 'confirmed-static')
        listing = fresh.get('/api/assessments').json['assessments']
        self.assertEqual(listing[0]['unresolved_count'], 0)
        for fmt in ('json', 'markdown'):
            export = fresh.get(path + '/export?format=' + fmt)
            self.assertEqual(export.status_code, 200)
            self.assertIn('attachment', export.headers['Content-Disposition'])
            self.assertIn('Reviewed taint flow', export.get_data(as_text=True))
        self.assertEqual(fresh.get(path + '/export?format=html').status_code, 400)
        self.assertEqual(self.client.delete(path, headers={'X-CSRF-Token': self.token}).status_code, 200)
        self.assertEqual(fresh.get(path).status_code, 404)
        self.assertEqual(fresh.get(path + '/export').status_code, 404)
        self.assertEqual(fresh.get('/api/assessments').json['assessments'], [])

    def test_nonexistent_findings_and_resources_return_json_errors(self):
        self.assertEqual(self.client.get('/api/assessments/missing').status_code, 404)
        aid = self.create().json['assessment']['id']
        response = self.client.patch(f'/api/assessments/{aid}/findings/missing', json={'verdict': 'unresolved', 'note': 'Not available'}, headers={'X-CSRF-Token': self.token})
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.json)

    def test_production_requires_strong_deployment_keys(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {'APP_ACCESS_KEY': '', 'APP_SECRET_KEY': ''}):
            with self.assertRaises(ValueError):
                create_app({'DATA_DIR': self.temp.name})
        app = create_app({'DATA_DIR': self.temp.name, 'APP_ACCESS_KEY': 'x' * 24, 'SECRET_KEY': 's' * 32})
        self.assertTrue(app.config['SESSION_COOKIE_SECURE'])

    def test_whitespace_cannot_bypass_content_limit(self):
        self.assertEqual(self.create(content='eval(x)' + ' ' * 64000).status_code, 400)

    def test_non_ascii_csrf_is_rejected_without_server_error(self):
        response = self.client.post('/api/logout', headers={'X-CSRF-Token': 'é'})
        self.assertEqual(response.status_code, 403)

    def test_hostile_text_is_data_and_markdown_export_escapes_it(self):
        response = self.create(name='<img src=x onerror=alert(1)>', content='print("safe")')
        self.assertEqual(response.status_code, 201)
        assessment = response.json['assessment']
        export = self.client.get(f'/api/assessments/{assessment["id"]}/export?format=markdown')
        self.assertNotIn('<img', export.get_data(as_text=True))
        self.assertIn('&lt;', export.get_data(as_text=True))

    def test_deep_json_and_invalid_unicode_return_client_errors(self):
        response = self.client.post('/api/assessments', data='[' * 1100 + '0' + ']' * 1100,
                                   content_type='application/json', headers={'X-CSRF-Token': self.token})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.create(content='print("\ud800")').status_code, 400)
        response = self.client.post('/api/login', json={'access_key': '\ud800' * 24})
        self.assertEqual(response.status_code, 400)

    def test_exercise_routes_scenarios_without_retaining_raw_prose(self):
        ransomware = self.create(workflow='exercise', content='Unique prose 95342: ransomware encrypts payroll').json['assessment']
        identity = self.create(workflow='exercise', content='Unique prose 89241: phishing targets business identities').json['assessment']
        cloud = self.create(workflow='exercise', content='AWS cloud tenant access review').json['assessment']
        supply = self.create(workflow='exercise', content='Third-party package supply-chain incident').json['assessment']
        generic = self.create(workflow='exercise', content='A business security workshop').json['assessment']
        expected = ('ransomware', 'identity/phishing', 'cloud', 'supply-chain', 'generic')
        for assessment, category in zip((ransomware, identity, cloud, supply, generic), expected):
            self.assertEqual(assessment['scenario_category'], category)
            self.assertTrue(all(len(m['steps']) >= 4 for m in assessment['missions']))
        self.assertNotEqual(ransomware['missions'][0]['steps'], identity['missions'][0]['steps'])
        serialized = json.dumps(ransomware) + json.dumps(identity)
        self.assertNotIn('Unique prose', serialized)
        for file in Path(self.temp.name).iterdir():
            if file.is_file():
                self.assertNotIn(b'Unique prose', file.read_bytes())

    def test_workflow_missions_guide_evidence_collection(self):
        code = self.create().json['assessment']
        alerts = self.create(workflow='alerts', content='[{"event":"malware_detected"}]').json['assessment']
        self.assertIn('ledger', code['missions'][0]['steps'][0].lower())
        self.assertIn('corroborat', alerts['missions'][0]['steps'][0].lower())

    def test_deployment_keys_must_be_distinct(self):
        with self.assertRaises(ValueError):
            create_app({'DATA_DIR': self.temp.name, 'APP_ACCESS_KEY': 'x' * 32, 'SECRET_KEY': 'x' * 32})

    def test_multiword_secrets_and_bearer_tokens_are_redacted_across_metadata(self):
        password = 'Correct Horse Battery Staple'
        bearer = 'private-session-token-92841'
        assessment = self.create(name=f'password="{password}"',
                                 scope=f'Owned test: Authorization: Bearer {bearer}').json['assessment']
        aid, fid = assessment['id'], assessment['findings'][0]['id']
        response = self.client.patch(f'/api/assessments/{aid}/findings/{fid}',
            json={'verdict': 'unresolved', 'note': f'password=\'{password}\'; Authorization: Bearer {bearer}'},
            headers={'X-CSRF-Token': self.token})
        self.assertEqual(response.status_code, 200)
        outputs = [response.get_data(as_text=True), self.client.get('/api/assessments').get_data(as_text=True)]
        for fmt in ('json', 'markdown'):
            outputs.append(self.client.get(f'/api/assessments/{aid}/export?format={fmt}').get_data(as_text=True))
        for value in outputs:
            self.assertNotIn(password, value)
            self.assertNotIn(bearer, value)
        for file in Path(self.temp.name).iterdir():
            if file.is_file():
                self.assertNotIn(password.encode(), file.read_bytes())
                self.assertNotIn(bearer.encode(), file.read_bytes())

    def test_unknown_alert_labels_disclose_skipped_count(self):
        assessment = self.create(workflow='alerts', content='[{"event":"unrecognized"},{"event":"another"}]').json['assessment']
        self.assertEqual(assessment['findings'], [])
        self.assertIn('2 event(s) skipped', ' '.join(assessment['coverage']))


if __name__ == '__main__':
    unittest.main()
