import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from gradio_app import build_application, build_ui, create_service, main


class NativeWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config = {'TESTING': True, 'DATA_DIR': self.temp.name,
                       'APP_ACCESS_KEY': 'native-workspace-access-key-12345',
                       'SECRET_KEY': 'native-session-signing-key-long-enough-12345'}
        self.service = create_service(self.config)

    def tearDown(self):
        self.temp.cleanup()

    def payload(self, **changes):
        value = dict(name='Native review', scope='Owned laboratory app', workflow='code',
                     content='eval(user_input)', authorization=True,
                     roles=['red', 'blue', 'white', 'black', 'purple'])
        value.update(changes)
        return value

    def test_adapter_runs_all_workflows_and_preserves_evidence_decisions(self):
        self.assertEqual(self.service.list_assessments(), [])
        code = self.service.create(self.payload())
        alert = self.service.create(self.payload(workflow='alerts', content='[{"event":"malware_detected"}]'))
        exercise = self.service.create(self.payload(workflow='exercise', content='A ransomware tabletop'))
        self.assertEqual(len(code['findings']), 1)
        self.assertEqual(len(alert['findings']), 1)
        self.assertEqual(exercise['scenario_category'], 'ransomware')
        self.assertEqual(len(exercise['missions']), 5)
        reviewed = self.service.review(code['id'], code['findings'][0]['id'], 'confirmed-static', 'Traced input reachability through the owned laboratory application.')
        self.assertEqual(reviewed['findings'][0]['verdict'], 'confirmed-static')
        fresh = create_service(self.config)
        self.assertEqual(fresh.get(code['id'])['findings'][0]['verdict'], 'confirmed-static')
        self.assertEqual(len(fresh.list_assessments()), 3)
        self.assertEqual(json.loads(fresh.export(code['id'], 'json'))['id'], code['id'])
        self.assertIn('Traced input reachability', fresh.export(code['id'], 'markdown'))
        self.assertTrue(fresh.delete(code['id'])['ok'])
        with self.assertRaises(ValueError):
            fresh.get(code['id'])

    def test_adapter_preserves_scope_validation_and_redaction(self):
        with self.assertRaises(ValueError):
            self.service.create(self.payload(authorization=False))
        with self.assertRaises(ValueError):
            self.service.create(self.payload(roles=['unknown']))
        assessment = self.service.create(self.payload(content='password="private-secret-value-44232"'))
        self.assertNotIn('private-secret-value-44232', json.dumps(assessment))
        with self.assertRaises(ValueError):
            self.service.review(assessment['id'], assessment['findings'][0]['id'], 'confirmed-runtime', 'yes')
        with self.assertRaises(ValueError):
            self.service.export(assessment['id'], 'html')

    def test_native_ui_has_workflows_roles_review_and_no_file_components(self):
        ui = build_ui(self.service)
        config = ui.get_config_file()
        types = [component['type'] for component in config['components']]
        self.assertNotIn('file', types)
        self.assertNotIn('uploadbutton', types)
        props = [component.get('props', {}) for component in config['components']]
        role = next(item for item in props if item.get('label') == 'Security perspectives')
        self.assertEqual(set(role['value']), {'red', 'blue', 'white', 'black', 'purple'})
        workflow = next(item for item in props if item.get('label') == 'Workflow')
        choices = [choice[1] if isinstance(choice, (tuple, list)) else choice for choice in workflow['choices']]
        self.assertEqual(set(choices), {'code', 'alerts', 'exercise'})
        self.assertTrue(any(item.get('label') == 'Evidence note' for item in props))
        self.assertTrue(any(item.get('label') == 'Export text' for item in props))
        self.assertFalse(ui.analytics_enabled)
        self.assertFalse(ui.enable_queue)
        self.assertFalse(ui.run_history)
        self.assertTrue(all(not dependency['queue'] for dependency in config['dependencies']))

    def test_native_callbacks_create_review_export_and_delete(self):
        ui = build_ui(self.service)
        callbacks = [block.fn for block in ui.fns.values()]
        created = callbacks[1]('Callback review', 'code', 'Owned lab app', ['red', 'blue', 'white', 'black', 'purple'], 'eval(user_input)', True)
        self.assertEqual(len(created), 8)
        assessment = created[2]
        self.assertEqual(created[5], '')
        self.assertEqual(len(assessment['missions']), 5)
        opened = callbacks[2](assessment['id'])
        self.assertEqual(opened[0]['id'], assessment['id'])
        reviewed = callbacks[3](assessment['id'], assessment['findings'][0]['id'], 'rejected', 'Verified this is unreachable in the supplied owned app.')
        self.assertEqual(reviewed[0]['findings'][0]['verdict'], 'rejected')
        self.assertEqual(len(reviewed), 6)
        self.assertEqual(reviewed[5], '')
        self.assertIn('Verified this is unreachable', callbacks[4](assessment['id'], 'markdown'))
        with self.assertRaises(Exception):
            callbacks[5](assessment['id'], False)
        self.assertEqual(len(self.service.list_assessments()), 1)
        callbacks[5](assessment['id'], True)
        self.assertEqual(self.service.list_assessments(), [])

    def test_selection_change_and_reload_clear_stale_review_and_delete_state(self):
        ui = build_ui(self.service)
        config = ui.get_config_file()
        input_events = [dependency for dependency in config['dependencies']
                        if any(target[1] == 'input' for target in dependency['targets'])]
        self.assertEqual(len(input_events), 1)
        callback = ui.fns[input_events[0]['id']].fn
        first = self.service.create(self.payload())
        second = self.service.create(self.payload(name='Second review'))
        selected = callback(second['id'])
        self.assertEqual(selected[0]['id'], second['id'])
        self.assertNotEqual(selected[0]['id'], first['id'])
        self.assertEqual(selected[3:], ('', '', False))
        cleared = callback(None)
        self.assertEqual(cleared[0], {})
        self.assertEqual(cleared[3:], ('', '', False))
        reloaded = list(ui.fns.values())[0].fn()
        self.assertEqual(len(reloaded), 8)
        self.assertEqual(reloaded[2], {})
        self.assertFalse(reloaded[-1])

    def test_gradio_auth_gates_config_and_callbacks_without_mounting_flask(self):
        import gradio as gr
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        ui = build_ui(self.service)
        mounted = gr.mount_gradio_app(FastAPI(), ui, path='/', auth=('analyst', self.config['APP_ACCESS_KEY']),
            run_history=False, enable_monitoring=False, mcp_server=False,
            theme=gr.themes.Base(font=['Arial', 'sans-serif'], font_mono=['Courier New', 'monospace']))
        with TestClient(mounted) as client:
            self.assertEqual(client.get('/config').status_code, 401)
            callback = client.post('/gradio_api/run/run', json={'data': [], 'fn_index': 0})
            self.assertIn(callback.status_code, (401, 403))
            self.assertEqual(client.get('/api/assessments').status_code, 404)
            self.assertEqual(client.post('/login', data={'username': 'analyst', 'password': 'wrong'}).status_code, 400)
            self.assertEqual(client.post('/login', data={'username': 'analyst', 'password': self.config['APP_ACCESS_KEY']}).status_code, 200)
            config = client.get('/config')
            self.assertEqual(config.status_code, 200)
            self.assertNotIn('fonts.googleapis.com', config.text)
            self.assertFalse(config.json()['run_history'])

    def test_missing_secrets_render_setup_without_backend_or_data_directory(self):
        config = {'DATA_DIR': str(Path(self.temp.name) / 'must-not-exist')}
        with patch.dict(os.environ, {'APP_ACCESS_KEY': '', 'APP_SECRET_KEY': ''}):
            with self.assertRaises(ValueError):
                create_service(config)
            ui = build_application(config)
        self.assertFalse(Path(config['DATA_DIR']).exists())
        ui_config = ui.get_config_file()
        self.assertEqual(ui_config['dependencies'], [])
        content = ' '.join(str(c.get('props', {}).get('value', '')) for c in ui_config['components'])
        self.assertIn('APP_ACCESS_KEY', content)
        self.assertIn('APP_SECRET_KEY', content)
        self.assertNotIn(self.config['APP_ACCESS_KEY'], content)

    def test_deployed_origin_policy_blocks_hosted_cross_site_reads_and_mutations(self):
        from fastapi.testclient import TestClient
        with patch.dict(os.environ, {'APP_ACCESS_KEY': self.config['APP_ACCESS_KEY'],
                                     'APP_SECRET_KEY': self.config['SECRET_KEY'],
                                     'DATA_DIR': self.temp.name, 'SPACE_ID': 'test/cyber-command'}):
            with patch('gradio_app.uvicorn.run') as launch:
                main()
        mounted = launch.call_args.args[0]
        self.assertEqual(launch.call_args.kwargs['host'], '0.0.0.0')
        hosted = 'https://test-cyber-command.hf.space'
        with TestClient(mounted, base_url=hosted) as client:
            foreign_login = client.post('/login', data={'username': 'analyst', 'password': self.config['APP_ACCESS_KEY']},
                                        headers={'Origin': 'https://attacker.example'})
            self.assertEqual(foreign_login.status_code, 403)
            self.assertNotIn('access-control-allow-origin', foreign_login.headers)
            self.assertEqual(client.post('/login', data={'username': 'analyst', 'password': self.config['APP_ACCESS_KEY']}).status_code, 200)
            for origin in ('https://attacker.example', 'null', hosted + '/path', 'http://test-cyber-command.hf.space',
                           hosted + ':443@attacker.example', hosted + ':9443'):
                with self.subTest(origin=origin):
                    response = client.get('/config', headers={'Origin': origin})
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn('access-control-allow-origin', response.headers)
                    callback = client.post('/gradio_api/run/run', json={'data': [], 'fn_index': 0}, headers={'Origin': origin})
                    self.assertEqual(callback.status_code, 403)
            preflight = client.options('/config', headers={'Origin': 'https://attacker.example', 'Access-Control-Request-Method': 'GET'})
            self.assertEqual(preflight.status_code, 403)
            self.assertNotIn('access-control-allow-origin', preflight.headers)
            config = client.get('/config', headers={'Origin': hosted})
            self.assertEqual(config.status_code, 200)
            callback = client.post('/gradio_api/run/run', json={'data': [], 'fn_index': 0}, headers={'Origin': hosted})
            self.assertEqual(callback.status_code, 200)
            self.assertEqual(client.get('/config').status_code, 200)


if __name__ == '__main__':
    unittest.main()
