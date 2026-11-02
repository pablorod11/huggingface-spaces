"""Single-workspace service. Configure keys before starting the application factory."""

from contextlib import closing, contextmanager
from datetime import timedelta
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time

from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.exceptions import HTTPException

from engine import VERDICTS, analyze, bounded_text, markdown_export, now, redact


def create_app(config=None):
    app = Flask(__name__, static_folder='static', static_url_path='/static')
    app.config.from_mapping(
        APP_ACCESS_KEY=os.environ.get('APP_ACCESS_KEY', ''),
        SECRET_KEY=os.environ.get('APP_SECRET_KEY', ''),
        DATA_DIR=os.environ.get('DATA_DIR', './data'),
        WORKSPACE_NAME=os.environ.get('WORKSPACE_NAME', 'Enterprise workspace'),
        SESSION_COOKIE_NAME='cyber_command_session',
        SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict',
        SESSION_COOKIE_SECURE=os.environ.get('COOKIE_SECURE', 'true').lower() != 'false',
        PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
        MAX_CONTENT_LENGTH=280000,
    )
    if config:
        app.config.update(config)
    access_key = app.config['APP_ACCESS_KEY']
    secret_key = app.config['SECRET_KEY']
    if not isinstance(access_key, str) or len(access_key) < 24 or not isinstance(secret_key, (str, bytes)) or len(secret_key) < 32:
        raise ValueError('Set APP_ACCESS_KEY (24+ characters) and APP_SECRET_KEY (32+ characters).')
    secret_bytes = secret_key.encode() if isinstance(secret_key, str) else secret_key
    if hmac.compare_digest(access_key.encode(), secret_bytes):
        raise ValueError('Access and session signing keys must be distinct.')
    data_dir = Path(app.config['DATA_DIR'])
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    database = data_dir / 'assessments.sqlite3'
    with closing(sqlite3.connect(database)) as initial, initial:
        initial.execute('PRAGMA secure_delete=ON')
        initial.execute('CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    database.chmod(0o600)
    failures = {}
    throttle_lock = threading.Lock()

    @contextmanager
    def connection():
        with closing(sqlite3.connect(database, timeout=10)) as db, db:
            db.execute('PRAGMA secure_delete=ON')
            yield db

    def authenticated():
        if session.get('authenticated') is True and isinstance(session.get('expires_at'), (int, float)) and session['expires_at'] > time.time():
            return True
        session.clear()
        return False

    def session_response():
        active = authenticated()
        return jsonify(authenticated=active, csrf_token=session.get('csrf_token') if active else None,
                       workspace=app.config['WORKSPACE_NAME'])

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError('A JSON object is required.')
        return value

    def load(assessment_id, db=None):
        if db is None:
            with connection() as owned:
                row = owned.execute('SELECT body FROM assessments WHERE id=?', (assessment_id,)).fetchone()
        else:
            row = db.execute('SELECT body FROM assessments WHERE id=?', (assessment_id,)).fetchone()
        if row is None:
            from flask import abort
            abort(404, description='Assessment not found.')
        return json.loads(row[0])

    @app.before_request
    def protect():
        if request.path.startswith('/api/') and request.path not in ('/api/session', '/api/login'):
            if not authenticated():
                return jsonify(error='Authentication required.'), 401
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                supplied = request.headers.get('X-CSRF-Token', '')
                expected = session.get('csrf_token', '')
                if not supplied or not expected or not hmac.compare_digest(supplied.encode(), expected.encode()):
                    return jsonify(error='Invalid CSRF token.'), 403

    @app.after_request
    def headers(response):
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Cache-Control'] = 'no-store'
        if request.is_secure:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    @app.errorhandler(ValueError)
    def bad_value(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected(error):
        # Do not log request data or exception messages that might contain customer input.
        app.logger.error('Request failed (%s).', type(error).__name__)
        return jsonify(error='Request could not be completed.'), 500

    @app.get('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.get('/api/session')
    def get_session():
        return session_response()

    @app.post('/api/login')
    def login():
        payload = body()
        provided = payload.get('access_key')
        if not isinstance(provided, str) or len(provided) > 1000:
            raise ValueError('Access key must be a string of at most 1000 characters.')
        current = time.monotonic()
        address = request.remote_addr or 'unknown'
        with throttle_lock:
            # Bounded in-memory throttle; deployment intentionally runs a single worker.
            for key in list(failures):
                if current - failures[key][0] >= 300:
                    del failures[key]
            started, attempts = failures.get(address, (current, 0))
            if attempts >= 5:
                return jsonify(error='Too many login attempts. Try again in five minutes.'), 429
            if not hmac.compare_digest(provided.encode(), access_key.encode()):
                if len(failures) >= 4096 and address not in failures:
                    return jsonify(error='Login capacity exceeded. Try again later.'), 429
                failures[address] = (started, attempts + 1)
                return jsonify(error='Invalid access key.'), 401
            failures.pop(address, None)
        session.clear()
        session.permanent = True
        session.update(authenticated=True, csrf_token=secrets.token_urlsafe(32), expires_at=time.time() + 3600)
        return session_response()

    @app.post('/api/logout')
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get('/api/assessments')
    def list_assessments():
        with connection() as db:
            rows = db.execute('SELECT body FROM assessments ORDER BY rowid DESC').fetchall()
        summaries = []
        for row in rows:
            assessment = json.loads(row[0])
            summary = {field: assessment[field] for field in ('id', 'name', 'workflow', 'scope', 'created_at', 'roles')}
            summary.update(finding_count=len(assessment['findings']), unresolved_count=sum(f['verdict'] == 'unresolved' for f in assessment['findings']))
            summaries.append(summary)
        return jsonify(assessments=summaries)

    @app.post('/api/assessments')
    def create_assessment():
        assessment = analyze(body())
        with connection() as db:
            db.execute('INSERT INTO assessments (id, body) VALUES (?, ?)', (assessment['id'], json.dumps(assessment)))
        return jsonify(assessment=assessment), 201

    @app.get('/api/assessments/<assessment_id>')
    def get_assessment(assessment_id):
        return jsonify(assessment=load(assessment_id))

    @app.delete('/api/assessments/<assessment_id>')
    def delete_assessment(assessment_id):
        with connection() as db:
            cursor = db.execute('DELETE FROM assessments WHERE id=?', (assessment_id,))
            if not cursor.rowcount:
                from flask import abort
                abort(404, description='Assessment not found.')
        return jsonify(ok=True)

    @app.patch('/api/assessments/<assessment_id>/findings/<finding_id>')
    def review_finding(assessment_id, finding_id):
        payload = body()
        verdict = payload.get('verdict')
        if verdict not in VERDICTS:
            raise ValueError('Unsupported finding verdict.')
        minimum = 20 if verdict in ('confirmed-static', 'confirmed-runtime', 'rejected') else 1
        note = redact(bounded_text(payload.get('note'), 'Evidence note', 4000, minimum))
        with connection() as db:
            db.execute('BEGIN IMMEDIATE')
            assessment = load(assessment_id, db)
            target = next((f for f in assessment['findings'] if f['id'] == finding_id), None)
            if target is None:
                from flask import abort
                abort(404, description='Finding not found.')
            target.update(verdict=verdict, review_note=note)
            assessment['activity'].append(dict(at=now(), action='finding_reviewed', note=f'{finding_id}: {verdict}. Analyst evidence: {note}'))
            assessment['summary'] = f'{len(assessment["findings"])} candidate(s); {sum(f["verdict"] == "unresolved" for f in assessment["findings"])} unresolved. Verdicts reflect shared-workspace analyst decisions, not automated proof.'
            db.execute('UPDATE assessments SET body=? WHERE id=?', (json.dumps(assessment), assessment_id))
        return jsonify(assessment=assessment)

    @app.get('/api/assessments/<assessment_id>/export')
    def export_assessment(assessment_id):
        assessment = load(assessment_id)
        fmt = request.args.get('format', 'json')
        if fmt == 'json':
            response = app.response_class(json.dumps(assessment, indent=2), mimetype='application/json')
            extension = 'json'
        elif fmt == 'markdown':
            response = app.response_class(markdown_export(assessment), mimetype='text/markdown')
            extension = 'md'
        else:
            raise ValueError('Export format must be json or markdown.')
        response.headers['Content-Disposition'] = f'attachment; filename="assessment-{assessment["id"]}.{extension}"'
        return response

    return app
