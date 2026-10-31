"""Run an optional task-local scholarly SearXNG instance on loopback only."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,default=Path('/Users/sanjusrikanth/Documents/Codex/napolean-research'))
    parser.add_argument('--port',type=int,default=8889)
    args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('Use an unprivileged port')
    source=args.runtime/'searxng'
    if not (source/'searx/webapp.py').is_file():parser.error('Existing SearXNG source runtime not found')
    state=Path(__file__).resolve().parent/'.state';state.mkdir(exist_ok=True)
    temporary=state/'tmp';temporary.mkdir(exist_ok=True);tempfile.tempdir=str(temporary)
    # JSON is valid YAML; no configuration from the existing instance is changed.
    settings={'use_default_settings':{'engines':{'keep_only':['arxiv','pubmed']}},
        'server':{'secret_key':secrets.token_hex(32),'limiter':False,'public_instance':False},
        'search':{'formats':['html','json']},'outgoing':{'request_timeout':12.0},
        'engines':[{'name':name,'disabled':False} for name in ['arxiv','pubmed']]}
    config=state/'science-search.yml';config.write_text(json.dumps(settings));config.chmod(0o600)
    os.environ['SEARXNG_SETTINGS_PATH']=str(config)
    sys.path.insert(0,str(source));os.chdir(source)
    from searx.webapp import app
    app.run(host='127.0.0.1',port=args.port,debug=False,use_reloader=False,threaded=True)

if __name__=='__main__':main()
