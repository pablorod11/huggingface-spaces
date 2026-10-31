"""Embed locally computed evidence in a portable, offline HTML workbench."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def render(exceptions, summary, acceptance):
    sources = {}
    for name in ('orders', 'activations', 'charges'):
        with (ROOT / 'data' / f'{name}.csv').open(newline='') as f:
            sources[name] = list(csv.DictReader(f))
    sql = {key: (ROOT / 'sql' / filename).read_text()
           for key, filename in [('schema','01_schema.sql'),('checks','02_reconcile.sql')]}
    # Extract the exact exception branches from executable SQL rather than maintain copied predicates.
    union = sql['checks'].split('CREATE VIEW exception_keys AS\n', 1)[1].split(';', 1)[0]
    predicates = {}
    for branch in union.split('\nUNION '):
        for row in exceptions:
            if "'" + row['rule'] + "'" in branch:
                predicates[row['rule']] = branch if branch.startswith('SELECT') else 'SELECT ' + branch
    payload = dict(exceptions=exceptions, summary=summary, acceptance=acceptance, sources=sources, sql=sql, predicates=predicates)
    # Safe script embedding even if a future fixture contains HTML-like strings.
    embedded = json.dumps(payload).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    (ROOT / 'index.html').write_text((ROOT / 'page.template.html').read_text().replace('__PAYLOAD__', embedded))
