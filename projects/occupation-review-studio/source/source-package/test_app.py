"""Integration checks against trained JSON artifact and real app callbacks."""
import csv
import xml.etree.ElementTree as ET
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import gradio as gr
import app
from prepare_data import normalized
from review import route_confidence


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.session = app.new_session()
        self.addCleanup(app.cleanup, self.session)

    def test_model_predictions_and_input_guards(self):
        result = app.classifier.predict('Develop software applications and test computer programs.')
        self.assertEqual(set(result['probabilities']), set(app.LABELS))
        self.assertAlmostEqual(sum(result['probabilities'].values()), 1.0)
        self.assertEqual(result['route'], route_confidence(result['confidence'], **{
            'auto_accept_threshold': app.classifier.thresholds['auto_accept'],
            'escalate_threshold': app.classifier.thresholds['escalate']}))
        for text in ['', '  ', None, 'x' * 10001]:
            with self.assertRaises(ValueError):
                app.classifier.predict(text)
        self.assertEqual(app.classifier.predict('zzzzzzzzzzq qqqqqqqqqzzz')['route'], 'ESCALATE')

    def test_full_escalation_correction_and_export(self):
        result = app.classify('zzzzzzzzzzq qqqqqqqqqzzz', self.session)
        selected, item = result[4:6]
        self.assertEqual(item['status'], 'escalated')
        self.assertIsNone(item['final_label'])
        self.assertEqual(result[3]['value'], selected['id'])
        with self.assertRaises(gr.Error):
            app.review_action('claim', selected, 'Ordinary reviewer', 'SOFTWARE', '', self.session)
        claimed = app.review_action('claim', selected, 'Senior adjudicator', 'SOFTWARE', '', self.session)
        alternate = next(label for label in app.LABELS if label != item['prediction'])
        completed = app.review_action('resolve', claimed[2], 'Senior adjudicator', alternate, 'Simulated test correction', self.session)
        self.assertEqual(completed[3]['final_label'], alternate)
        self.assertEqual(completed[3]['provenance'], 'HUMAN')
        self.assertEqual(completed[3]['corrected'], 1)
        self.assertEqual(len(completed[4]), 3)
        with self.assertRaises(gr.Error):
            app.review_action('resolve', claimed[2], 'Senior adjudicator', 'SOFTWARE', 'Stale attempt', self.session)
        with open(app.export_feedback(self.session), newline='') as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['final_label'], alternate)
        self.assertEqual(json.loads(rows[0]['history_json'])[-1]['reason'], 'Simulated test correction')

    def test_session_isolation_and_out_of_scope(self):
        second = app.new_session()
        self.addCleanup(app.cleanup, second)
        result = app.classify('zzzzzzzzzzq', self.session)
        db = app.store(second)
        try:
            self.assertEqual(db.list_items(), [])
        finally:
            db.close()
        claimed = app.review_action('claim', result[4], 'Senior adjudicator', 'SOFTWARE', '', self.session)
        closed = app.review_action('out_of_scope', claimed[2], 'Senior adjudicator', 'SOFTWARE', 'Outside the supported taxonomy', self.session)
        self.assertEqual(closed[3]['status'], 'out_of_scope')
        self.assertIsNone(closed[3]['final_label'])
        with open(app.export_feedback(self.session), newline='') as handle:
            self.assertEqual(list(csv.DictReader(handle)), [])

    def test_split_isolation_and_manifest(self):
        root = Path(__file__).parent
        records = {}
        manifest = json.loads((root / 'data' / 'provenance.json').read_text())
        for name in ['train', 'validation', 'test']:
            with (root / 'data' / f'{name}.csv').open(newline='') as handle:
                records[name] = list(csv.DictReader(handle))
            self.assertEqual(len(records[name]), manifest['splits'][name]['rows'])
            self.assertEqual({r['label'] for r in records[name]}, set(app.LABELS))
        for left, right in [('train','validation'),('train','test'),('validation','test')]:
            self.assertFalse({r['group'] for r in records[left]} & {r['group'] for r in records[right]})
            self.assertFalse({normalized(r['text']) for r in records[left]} & {normalized(r['text']) for r in records[right]})
        self.assertLessEqual(app.METRICS['export_parity']['maximum_probability_error'], 1e-10)

    def test_spreadsheet_formula_guard(self):
        for value in ['=1+1', '+cmd', '-1+2', '@SUM(A1)', '  =1+1', '\tplain', '\rplain', '\nplain']:
            self.assertTrue(app.spreadsheet_safe(value).startswith("'"))
        self.assertEqual(app.spreadsheet_safe('ordinary description'), 'ordinary description')

    def test_guided_cases_and_presentation(self):
        result = app.guided_demo(self.session)
        self.assertEqual(len(result), 9)
        self.assertEqual(len(result[2]), 3)
        self.assertIn('3</strong>', result[7])
        self.assertIn('Senior adjudicator', result[8])
        self.assertEqual(result[5]['status'], 'escalated')
        refreshed = app.select_view(result[4]['id'], self.session)
        self.assertEqual(refreshed[0], result[4])
        self.assertIn('Decision trail', refreshed[3])

    def test_rendered_record_escapes_untrusted_content(self):
        item = {'text': '<img src=x onerror=alert(1)>', 'status': 'in_review',
                'owner': '<script>bad</script>', 'prediction': 'SOFTWARE',
                'confidence': .6, 'final_label': None}
        events = [{'action':'claim', 'actor':'<b>actor</b>', 'timestamp':'2026-10-16T12:00:00',
                   'reason':'<script>reason</script>'}]
        markup = app.record_overview(item, events)
        self.assertNotIn('<script>', markup)
        self.assertNotIn('<img ', markup)
        self.assertIn('&lt;img', markup)
        self.assertIn('&lt;b&gt;actor', markup)
        self.assertIn('&lt;script&gt;reason', markup)

    def test_invalid_demo_identity_and_missing_revision(self):
        result = app.classify('zzzzzzzzzzq', self.session)
        with self.assertRaises(gr.Error):
            app.review_action('claim', result[4], 'Invented admin', 'SOFTWARE', '', self.session)
        with self.assertRaises(gr.Error):
            app.review_action('claim', {'id':result[4]['id']}, 'Senior adjudicator', 'SOFTWARE', '', self.session)
        db = app.store(self.session)
        try:
            self.assertEqual(db.get(result[4]['id'])['revision'], 0)
        finally:
            db.close()

    def test_expected_ui_denial_preserves_existing_outputs(self):
        result = app.classify('zzzzzzzzzzq', self.session)
        with patch('app.gr.Warning') as warning:
            updates = app.review_view('claim', result[4], 'Ordinary reviewer', 'SOFTWARE', '', self.session)
        self.assertEqual(len(updates), 7)
        self.assertTrue(all(update == gr.skip() for update in updates))
        self.assertIn('senior', warning.call_args.args[0])
        db = app.store(self.session)
        try:
            self.assertEqual(db.get(result[4]['id'])['revision'], 0)
        finally:
            db.close()
        with patch('app.gr.Warning'):
            self.assertTrue(all(update == gr.skip() for update in app.classify_view('', self.session)))

    def test_diagram_has_accessible_name_and_no_remote_assets(self):
        svg = ET.parse(Path(__file__).parent / 'diagrams.svg').getroot()
        namespace = {'svg':'http://www.w3.org/2000/svg'}
        self.assertEqual(svg.attrib['role'], 'img')
        self.assertTrue(svg.find('svg:title', namespace).text)
        self.assertTrue(svg.find('svg:desc', namespace).text)
        for element in svg.iter():
            self.assertFalse(element.tag.endswith('script'))
            self.assertFalse(any(key.endswith('href') and value.startswith(('http:', 'https:')) for key,value in element.attrib.items()))

    def test_ui_constructs(self):
        demo = app.build_app()
        self.assertTrue(demo.config['components'])


if __name__ == '__main__':
    unittest.main()
