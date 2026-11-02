"""Native Hugging Face Gradio entry point; Flask stays an in-process service only."""

import os
from pathlib import Path
from urllib.parse import quote, urlsplit

# Set before importing Gradio; never retain submitted source in browser run history.
os.environ['GRADIO_ANALYTICS_ENABLED'] = 'False'
os.environ['GRADIO_RUN_HISTORY'] = 'False'

import gradio as gr
from fastapi import FastAPI
from starlette.middleware import Middleware
from starlette.responses import JSONResponse
import uvicorn

from app import create_app
from engine import ROLES, VERDICTS


class SameOriginMiddleware:
    """Reject cross-origin requests before Gradio's hosted CORS implementation."""

    def __init__(self, app):
        self.app = app

    @staticmethod
    def valid_origin(scope):
        origins = [value for name, value in scope['headers'] if name.lower() == b'origin']
        if not origins:
            return True  # First-party navigation and non-browser clients omit Origin.
        hosts = [value for name, value in scope['headers'] if name.lower() == b'host']
        if len(origins) != 1 or len(hosts) != 1:
            return False
        try:
            raw_origin, raw_host = origins[0].decode('ascii'), hosts[0].decode('ascii')
            if any(char.isspace() for char in raw_origin + raw_host):
                return False
            origin, host = urlsplit(raw_origin), urlsplit('//' + raw_host)
            if origin.scheme not in ('http', 'https') or not origin.hostname or not host.hostname:
                return False
            if origin.username is not None or origin.password is not None or host.username is not None or host.password is not None:
                return False
            if origin.path or origin.query or origin.fragment or host.path or host.query or host.fragment:
                return False
            # TLS terminates at the Hugging Face proxy, so scope['scheme'] may be HTTP.
            # Hosted service origins must be HTTPS; HTTP is allowed only on loopback.
            loopback = host.hostname.lower() in ('localhost', '127.0.0.1', '::1')
            expected_scheme = scope.get('scheme', 'http') if loopback else 'https'
            default_port = 443 if expected_scheme == 'https' else 80
            return (origin.scheme == expected_scheme
                    and origin.hostname.lower() == host.hostname.lower()
                    and (origin.port or default_port) == (host.port or default_port))
        except (ValueError, UnicodeError):
            return False

    async def __call__(self, scope, receive, send):
        if scope['type'] in ('http', 'websocket') and not self.valid_origin(scope):
            if scope['type'] == 'websocket':
                await send({'type': 'websocket.close', 'code': 1008})
            else:
                await JSONResponse({'error': 'Cross-origin requests are not allowed.'}, status_code=403)(scope, receive, send)
            return
        await self.app(scope, receive, send)


class WorkspaceService:
    """Preserve the existing authenticated API boundary without exposing a Flask server."""

    def __init__(self, app):
        self._app = app

    def _request(self, method, path, payload=None, query=None):
        with self._app.test_client() as client:
            options = {'base_url': 'https://internal.invalid'}
            login = client.post('/api/login', json={'access_key': self._app.config['APP_ACCESS_KEY']}, **options)
            if login.status_code != 200:
                raise ValueError('Internal workspace authentication failed.')
            response = client.open(path, method=method, json=payload, query_string=query,
                                   headers={'X-CSRF-Token': login.json['csrf_token']}, **options)
            if response.status_code >= 400:
                raise ValueError((response.get_json(silent=True) or {}).get('error', 'Workspace request failed.'))
            if path.endswith('/export'):
                return response.get_data(as_text=True)
            return response.get_json()

    def list_assessments(self):
        return self._request('GET', '/api/assessments')['assessments']

    def create(self, payload):
        return self._request('POST', '/api/assessments', payload)['assessment']

    def get(self, assessment_id):
        return self._request('GET', '/api/assessments/' + quote(str(assessment_id), safe=''))['assessment']

    def review(self, assessment_id, finding_id, verdict, note):
        path = '/api/assessments/' + quote(str(assessment_id), safe='') + '/findings/' + quote(str(finding_id), safe='')
        return self._request('PATCH', path, {'verdict': verdict, 'note': note})['assessment']

    def delete(self, assessment_id):
        return self._request('DELETE', '/api/assessments/' + quote(str(assessment_id), safe=''))

    def export(self, assessment_id, fmt):
        return self._request('GET', '/api/assessments/' + quote(str(assessment_id), safe='') + '/export', query={'format': fmt})


def create_service(config=None):
    return WorkspaceService(create_app(config))


def mission_report(assessment):
    lines = [assessment['summary'], '', 'COVERAGE'] + assessment['coverage']
    for mission in assessment['missions']:
        lines += ['', f'{mission["role"].upper()}: {mission["title"]}', mission['objective']]
        lines += [f'{index}. {step}' for index, step in enumerate(mission['steps'], 1)]
        lines += ['Deliverable: ' + mission['deliverable']]
        lines += ['Limitation: ' + text for text in mission['limitations']]
    return '\n'.join(lines)


def build_ui(service=None):
    with gr.Blocks(analytics_enabled=False, title='Napolean Cyber Command') as ui:
        gr.Markdown('# Napolean Cyber Command\nEnterprise security evidence and tabletop workbench')
        if service is None:
            gr.Markdown('## Workspace locked: setup required\n'
                        'Add **APP_ACCESS_KEY** (at least 24 characters) and **APP_SECRET_KEY** '
                        '(at least 32 characters) as distinct private Hugging Face Space Secrets, then restart. '
                        'Use username **analyst** and APP_ACCESS_KEY at login. '
                        'No customer data operations are available until configuration is valid. '
                        'Choose a durable DATA_DIR before storing business records.')
        else:
            gr.Markdown('One isolated customer workspace per deployment. Local heuristic candidates require human validation. '
                        'The five perspectives are planning roles. No live scanning, exploitation or model inference runs. '
                        'Raw submissions are discarded after analysis; results and analyst notes are retained. '
                        'Keep secrets out of metadata and notes: redaction is best-effort.')
            with gr.Row():
                with gr.Column():
                    name = gr.Textbox(label='Assessment name', max_length=120)
                    workflow = gr.Radio([('Python code review', 'code'), ('Structured alert triage', 'alerts'),
                                         ('Training exercise', 'exercise')], value='code', label='Workflow')
                    scope = gr.Textbox(label='Authorized scope', lines=2, max_length=2000,
                                       placeholder='Owned assets, purpose, permitted activity and boundaries')
                    roles = gr.CheckboxGroup(list(ROLES), value=list(ROLES), label='Security perspectives',
                        info='Red: adversary simulation · Blue: defense · White: review · Black: attacker-perspective lab · Purple: joint validation')
                    content = gr.Textbox(label='Source, alerts or scenario', lines=10, max_length=64000,
                        placeholder='Python snippet; JSON alert array with event/actor/source_ip fields; or tabletop scenario prose')
                    authority = gr.Checkbox(label='I am authorized to assess the stated scope.', value=False)
                    create_button = gr.Button('Create assessment', variant='primary')
                with gr.Column():
                    status = gr.Textbox(label='Workspace status', value='Reload assessments to view retained results.', interactive=False)
                    reload_button = gr.Button('Reload assessments')
                    selection = gr.Dropdown(label='Saved assessment', choices=[], interactive=True)
                    load_button = gr.Button('Open selected assessment')
                    missions = gr.Textbox(label='Missions and coverage', lines=16, interactive=False, buttons=['copy'])
            report = gr.JSON(label='Evidence ledger and assessment report', value={})
            with gr.Row():
                finding = gr.Dropdown(label='Finding to review', choices=[], interactive=True)
                verdict = gr.Dropdown(list(VERDICTS), value='unresolved', label='Analyst verdict', interactive=True)
            note = gr.Textbox(label='Evidence note', lines=3, max_length=4000,
                              info='Confirmations and rejections require at least 20 characters describing supporting evidence. Verdicts are analyst assertions.')
            review_button = gr.Button('Save analyst decision')
            with gr.Row():
                export_format = gr.Radio(['json', 'markdown'], value='json', label='Export format')
                export_button = gr.Button('Prepare copyable export')
            export_text = gr.Textbox(label='Export text', lines=10, interactive=False, buttons=['copy'])
            delete_confirm = gr.Checkbox(label='I confirm deletion of the selected assessment and its retained ledger.', value=False)
            delete_button = gr.Button('Delete selected assessment', variant='stop')

            def choices(selected=None):
                assessments = service.list_assessments()
                return gr.Dropdown(choices=[(f'{a["name"]} · {a["workflow"]} · {a["finding_count"]} candidates', a['id']) for a in assessments], value=selected), f'{len(assessments)} retained assessment(s).'

            def view(assessment):
                findings = assessment['findings']
                return assessment, mission_report(assessment), gr.Dropdown(
                    choices=[(f'{f["severity"]} · {f["title"]} · {f["verdict"]}', f['id']) for f in findings],
                    value=findings[0]['id'] if findings else None)

            def guarded(callback):
                def run(*values):
                    try:
                        return callback(*values)
                    except ValueError as error:
                        raise gr.Error(str(error)) from None
                return run

            def create_assessment(title, mode, authorized_scope, perspectives, submission, attested):
                assessment = service.create(dict(name=title, workflow=mode, scope=authorized_scope,
                                                  roles=perspectives, content=submission, authorization=attested))
                selected, message = choices(assessment['id'])
                return selected, message, *view(assessment), '', '', False

            def open_assessment(assessment_id):
                if not assessment_id:
                    return {}, '', gr.Dropdown(choices=[], value=None), '', '', False
                return *view(service.get(assessment_id)), '', '', False

            def reload_assessments():
                selected, message = choices()
                return selected, message, *open_assessment(None)

            def review_assessment(assessment_id, finding_id, chosen_verdict, evidence_note):
                if not assessment_id or not finding_id:
                    raise ValueError('Open an assessment and select a finding first.')
                assessment = service.review(assessment_id, finding_id, chosen_verdict, evidence_note)
                return *view(assessment), 'Analyst decision saved.', '', ''

            def export_assessment(assessment_id, fmt):
                if not assessment_id:
                    raise ValueError('Select a saved assessment first.')
                return service.export(assessment_id, fmt)

            def delete_assessment(assessment_id, confirmed):
                if not assessment_id or confirmed is not True:
                    raise ValueError('Select an assessment and confirm deletion first.')
                service.delete(assessment_id)
                selected, message = choices()
                return selected, message, {}, '', gr.Dropdown(choices=[], value=None), '', '', False

            event_options = dict(queue=False, api_visibility='private')
            reload_button.click(guarded(reload_assessments),
                                outputs=[selection, status, report, missions, finding, note, export_text, delete_confirm], **event_options)
            create_button.click(guarded(create_assessment), inputs=[name, workflow, scope, roles, content, authority],
                                outputs=[selection, status, report, missions, finding, content, export_text, delete_confirm], **event_options)
            load_button.click(guarded(open_assessment), inputs=[selection],
                              outputs=[report, missions, finding, note, export_text, delete_confirm], **event_options)
            review_button.click(guarded(review_assessment), inputs=[selection, finding, verdict, note],
                                outputs=[report, missions, finding, status, export_text, note], **event_options)
            export_button.click(guarded(export_assessment), inputs=[selection, export_format], outputs=[export_text], **event_options)
            delete_button.click(guarded(delete_assessment), inputs=[selection, delete_confirm],
                                outputs=[selection, status, report, missions, finding, note, export_text, delete_confirm], **event_options)
            selection.input(guarded(open_assessment), inputs=[selection],
                            outputs=[report, missions, finding, note, export_text, delete_confirm], **event_options)
    ui.enable_queue = False
    ui.run_history = False
    return ui


def build_application(config=None):
    try:
        service = create_service(config)
    except ValueError:
        return build_ui()
    return build_ui(service)


def create_native_app():
    try:
        service = create_service()
    except ValueError:
        service = None
    ui = build_ui(service)
    data_dir = str(Path(os.environ.get('DATA_DIR', './data')).resolve())
    parent = FastAPI(middleware=[Middleware(SameOriginMiddleware)],
                     docs_url=None, redoc_url=None, openapi_url=None)
    return gr.mount_gradio_app(parent, ui, path='/',
              server_name='0.0.0.0' if os.environ.get('SPACE_ID') else '127.0.0.1', server_port=7860,
              auth=('analyst', os.environ['APP_ACCESS_KEY']) if service else None,
              run_history=False, footer_links=[], show_error=False,
              allowed_paths=[], blocked_paths=[data_dir], max_file_size='1kb',
              enable_monitoring=False, mcp_server=False,
              app_kwargs={'docs_url': None, 'redoc_url': None, 'openapi_url': None},
              theme=gr.themes.Base(font=['Arial', 'sans-serif'], font_mono=['Courier New', 'monospace']))


def main():
    app = create_native_app()
    uvicorn.run(app, host='0.0.0.0' if os.environ.get('SPACE_ID') else '127.0.0.1', port=7860,
                access_log=False)


if __name__ == '__main__':
    main()
