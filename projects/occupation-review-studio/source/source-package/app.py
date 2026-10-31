"""Hugging Face Space: model inference and isolated simulated review sessions."""
import csv
import html
import json
import os
import sqlite3
from pathlib import Path
import tempfile

import gradio as gr

from inference import Classifier
from review import LABELS, ReviewStore

ROOT = Path(__file__).resolve().parent
classifier = Classifier(ROOT / 'model' / 'model.json')
METRICS = json.loads((ROOT / 'model' / 'metrics.json').read_text())


def new_session():
    handle, path = tempfile.mkstemp(prefix='occupation-demo-', suffix='.sqlite')
    os.close(handle)
    return path


def cleanup(path):
    if path:
        Path(path).unlink(missing_ok=True)
        Path(path + '.feedback.csv').unlink(missing_ok=True)


def store(path):
    return ReviewStore(path, auto_accept_threshold=classifier.thresholds['auto_accept'],
                       escalate_threshold=classifier.thresholds['escalate'])


def queue_view(db, active_id):
    items = db.list_items()
    rows = [[x['id'][:8], x['prediction'], round(x['confidence'], 3), x['status'],
             x['final_label'] or '—', x['provenance'] or '—', x['revision']] for x in items]
    choices = [(f"{x['id'][:8]} · {x['status']} · {x['text'][:48]}", x['id']) for x in items]
    return rows, gr.update(choices=choices, value=active_id)


def classify(text, session):
    try:
        result = classifier.predict(text)
        db = store(session)
        try:
            item = db.add(text, result['prediction'], result['confidence'], result['model_version'],
                          route_override='ESCALATE' if result['known_features'] == 0 else None)
            rows, choices = queue_view(db, item['id'])
            history = db.history(item['id'])
        finally:
            db.close()
        route = {'AUTO_ACCEPT': 'Accepted by model', 'HUMAN_REVIEW': 'Human review required', 'ESCALATE': 'Senior review required'}[result['route']]
        status = ('A model label was accepted under the frozen validation policy.' if result['route'] == 'AUTO_ACCEPT'
                  else 'The final label stays empty until a reviewer resolves this item.')
        why = 'No known vocabulary was found; this always escalates.' if result['known_features'] == 0 else f"Model confidence: {result['confidence']:.1%}. Probabilities are uncalibrated."
        banner = f"<div class='decision'><span class='eyebrow'>NEXT STEP</span><h2>{html.escape(route)}</h2><p>{status}</p><p class='decision-reason'>{why}</p></div>"
        return result['probabilities'], banner, rows, choices, {'id': item['id'], 'revision': item['revision']}, item, history
    except (ValueError, TypeError) as exc:
        raise gr.Error(str(exc)) from exc


def select_item(item_id, session):
    if not item_id:
        return {}, {}, []
    db = store(session)
    try:
        item = db.get(item_id)
        return {'id': item['id'], 'revision': item['revision']}, item, db.history(item_id)
    finally:
        db.close()


def review_action(action, selected, identity, label, reason, session):
    if not isinstance(selected, dict) or not selected.get('id') or type(selected.get('revision')) is not int:
        raise gr.Error('Select a queue item first.')
    role = {'Ordinary reviewer': 'reviewer', 'Senior adjudicator': 'senior', 'Audit reader': 'auditor'}.get(identity)
    if role is None:
        raise gr.Error('Choose a supported simulated identity.')
    db = store(session)
    try:
        item = db.transition(selected['id'], f'demo-{role}', role, selected['revision'], action,
                             label=label, reason=reason)
        rows, choices = queue_view(db, item['id'])
        return rows, choices, {'id': item['id'], 'revision': item['revision']}, item, db.history(item['id'])
    except (ValueError, PermissionError) as exc:
        raise gr.Error(str(exc)) from exc
    finally:
        db.close()


def spreadsheet_safe(value):
    if isinstance(value, str) and (value.startswith(('\t', '\r', '\n')) or value.lstrip().startswith(('=', '+', '-', '@'))):
        return "'" + value
    return value


def export_feedback(session):
    db = store(session)
    try:
        completed = [x for x in db.list_items() if x['status'] == 'resolved' and x['provenance'] == 'HUMAN']
        path = session + '.feedback.csv'
        columns = ['id', 'text', 'prediction', 'confidence', 'final_label', 'corrected', 'model_version', 'revision', 'history_json']
        descriptor, temporary = tempfile.mkstemp(prefix='occupation-export-', dir=Path(session).parent)
        try:
            with os.fdopen(descriptor, 'w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=columns)
                writer.writeheader()
                for item in completed:
                    writer.writerow({**{k: spreadsheet_safe(item[k]) for k in columns if k != 'history_json'},
                                     'history_json': json.dumps(db.history(item['id']))})
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
        return path
    finally:
        db.close()


def queue_overview(items):
    unresolved = sum(x['status'] in ('pending', 'in_review', 'escalated') for x in items)
    escalated = sum(x['status'] == 'escalated' for x in items)
    resolved = sum(x['status'] == 'resolved' for x in items)
    return f"""<div class='queue-stats' aria-label='Session queue summary'>
      <div><strong>{len(items)}</strong><span>Session records</span></div>
      <div><strong>{unresolved}</strong><span>Need a decision</span></div>
      <div><strong>{escalated}</strong><span>Awaiting senior</span></div>
      <div><strong>{resolved}</strong><span>Resolved</span></div></div>"""


def record_overview(item, events):
    if not item:
        return "<div class='empty-state'><h3>Your review desk is ready</h3><p>Classify a description or add the guided demo cases, then select a record here.</p></div>"
    text = html.escape(item['text'])
    status = html.escape(item['status'].replace('_', ' ').title())
    final = html.escape(item['final_label'] or 'Withheld until a decision')
    if item['status'] in ('resolved', 'out_of_scope'):
        next_step = 'This decision is complete. Its label and history cannot be overwritten.'
    elif item['status'] == 'in_review':
        next_step = f"Claimed by {html.escape(item['owner'])}. Give a reason, then decide or escalate."
    elif item['senior_required']:
        next_step = 'Select Senior adjudicator and claim this escalation before deciding.'
    else:
        next_step = 'Claim this record before confirming a category or escalating it.'
    timeline = ''.join(f"<li><strong>{html.escape(e['action'].replace('_',' ').title())}</strong>"
                       f"<span>{html.escape(e['actor'])} · {html.escape(e['timestamp'][:19].replace('T',' '))} UTC</span>"
                       f"<p>{html.escape(e['reason'])}</p></li>" for e in events)
    return f"""<section class='review-detail'><div class='detail-heading'><span class='eyebrow'>SELECTED RECORD</span><span class='status-pill'>{status}</span></div>
      <h3>{text}</h3><dl><div><dt>Model suggestion</dt><dd>{html.escape(item['prediction'].title())} · {item['confidence']:.1%}</dd></div>
      <div><dt>Final label</dt><dd>{final}</dd></div></dl><p class='next-step'>{next_step}</p>
      <h4>Decision trail</h4><ol class='timeline'>{timeline}</ol></section>"""


def present(result, session):
    db = store(session)
    try:
        return (*result, queue_overview(db.list_items()), record_overview(result[-2], result[-1]))
    finally:
        db.close()


def warn_and_preserve(message, count):
    gr.Warning(message)
    return tuple(gr.skip() for _ in range(count))


def classify_view(text, session):
    try:
        return present(classify(text, session), session)
    except gr.Error as exc:
        return warn_and_preserve(str(exc), 9)
    except sqlite3.Error:
        return warn_and_preserve('Session storage is unavailable. Refresh before retrying.', 9)


def guided_demo(session):
    # Deliberately mixed inputs demonstrate paths, not independently labeled accuracy.
    for text in ['Develop and test software applications for business systems.',
                 'zzzzzzzzzzq qqqqqqqqqzzz',
                 'Coordinate technical systems, business records, and customer requests.']:
        result = classify(text, session)
    return present(result, session)


def select_view(item_id, session):
    selected, item, events = select_item(item_id, session)
    return selected, item, events, record_overview(item, events)


def review_view(action, selected, identity, label, reason, session):
    try:
        return present(review_action(action, selected, identity, label, reason, session), session)
    except gr.Error as exc:
        return warn_and_preserve(str(exc), 7)
    except sqlite3.Error:
        return warn_and_preserve('Session storage is unavailable. Refresh before retrying.', 7)


def role_guidance(identity):
    return {'Ordinary reviewer': 'Ordinary reviewers handle routine items and can escalate uncertainty. Claim the item before deciding.',
            'Senior adjudicator': 'Seniors can claim escalations, resolve them, or close them out of scope. A decision reason is required.',
            'Audit reader': 'Audit readers can inspect records, history, and feedback. They cannot claim or change decisions.'}.get(identity, 'Choose a simulated identity.')


CSS = (ROOT / 'ui.css').read_text()


def build_app():
    with gr.Blocks(title='Occupation Review Studio') as demo:
        session = gr.State(value=new_session, time_to_live=3600, delete_callback=cleanup)
        selected = gr.State({})
        gr.HTML("""<header id='hero'><div class='hero-top'><span class='eyebrow'>PABLOROD11 / BUSINESS SYSTEMS ANALYSIS</span><span class='status-pill'>Portfolio prototype</span></div>
          <h1>Occupation Review Studio<span class='title-dot'>.</span></h1>
          <p>Turn a model suggestion into a traceable decision.</p>
          <ol class='journey' aria-label='Workflow'><li><b>01</b> Classify the work</li><li><b>02</b> Review uncertainty</li><li><b>03</b> Keep the evidence</li></ol></header>""")
        gr.Markdown('**Independent case study with simulated business requirements.** O*NET® task data · temporary sessions · simulated identities.', elem_id='case-disclosure')
        with gr.Tab('01 Classify'):
            with gr.Row(equal_height=False):
                with gr.Column(scale=3, min_width=300):
                    gr.Markdown('### What does this person do?\nDescribe the work, then see both the suggestion and the next step.')
                    description = gr.Textbox(label='Work description', lines=4, max_lines=8,
                                              placeholder='Develop and test software applications for business systems.', max_length=10000)
                    run = gr.Button('Classify and route', variant='primary')
                    with gr.Accordion('Try a sample description', open=False):
                        gr.Examples([
                            ['Develop and test software applications for business systems.'],
                            ['Assess patients, administer medications, and monitor clinical symptoms.'],
                            ['Review budgets and prepare financial statements.'],
                            ['Repair electrical wiring and install building equipment.'],
                            ['Prepare classroom lessons and evaluate student assignments.'],
                            ['Coordinate technical systems, business records, and customer requests.'],
                        ], inputs=description)
                    guided = gr.Button('Add guided demo cases', size='sm')
                    gr.Markdown('Adds three fictional examples to your session: a clear task, unfamiliar wording, and mixed work. Open **Review** to inspect them.', elem_classes='help-copy')
                with gr.Column(scale=2, min_width=280):
                    decision = gr.HTML('<div class="decision"><span class="eyebrow">NEXT STEP</span><h2>Start with a description</h2><p>The model suggests a category. The routing policy decides whether it needs human attention.</p></div>')
                    probabilities = gr.Label(label='Model probability by category', num_top_classes=5)
            gr.Markdown('**Scope:** selected software, finance, healthcare, education, and trades occupations. Use fictional, non-sensitive text. Unrelated work can still receive a supported label; probability is not a guarantee of correctness.', elem_classes='scope-note')
        with gr.Tab('02 Review'):
            gr.Markdown('### A suggestion is not a final label\nYour session has its own queue. Unresolved items keep their final labels empty.')
            overview = gr.HTML(queue_overview([]))
            queue = gr.Dataframe(headers=['Record', 'Suggestion', 'Confidence', 'State', 'Final label', 'Source', 'Revision'],
                                 datatype=['str','str','number','str','str','str','number'], interactive=False, wrap=False,
                                 column_widths=[100,110,100,110,110,100,90], label='Session records')
            with gr.Row():
                item_select = gr.Dropdown(label='Select a record', choices=[], scale=4)
                refresh = gr.Button('Refresh record', scale=1, min_width=140)
            with gr.Row(equal_height=False):
                with gr.Column(scale=3, min_width=300):
                    detail = gr.HTML(record_overview({}, []))
                with gr.Column(scale=2, min_width=280):
                    gr.Markdown('### Review controls\nRoles are simulated. Anyone using this demo can switch identities.')
                    identity = gr.Dropdown(['Ordinary reviewer','Senior adjudicator','Audit reader'], value='Ordinary reviewer', label='Simulated identity')
                    guidance = gr.Markdown(role_guidance('Ordinary reviewer'), elem_classes='help-copy')
                    label = gr.Dropdown(list(LABELS), value='SOFTWARE', label='Human category')
                    reason = gr.Textbox(label='Decision reason', lines=3, placeholder='What evidence supports this decision?')
                    claim = gr.Button('1. Claim item')
                    resolve = gr.Button('2. Resolve with human label', variant='primary')
                    with gr.Row():
                        escalate = gr.Button('Escalate', size='sm')
                        out = gr.Button('Close out of scope', size='sm')
            with gr.Accordion('Technical record and complete history', open=False):
                record = gr.JSON(label='Authoritative record')
                history = gr.JSON(label='Transactional history')
            with gr.Accordion('Export reviewed feedback', open=False):
                gr.Markdown('Exports resolved human decisions and their provenance. This creates evaluation candidates; it does not retrain the model.')
                export = gr.Button('Export completed human feedback')
                feedback = gr.File(label='Feedback CSV')
        with gr.Tab('03 Evidence'):
            test = METRICS['test']
            routing = test['routing']
            gr.Markdown('### Measured on held-out occupations\n173 task statements from 10 occupations. These are benchmark results, not measured business outcomes.')
            accepted_accuracy = 'Undefined' if routing['auto_accept_accuracy'] is None else f"{routing['auto_accept_accuracy']:.1%} correct among accepted"
            gr.HTML(f"""<div class='metrics'><div><span>TEST ACCURACY</span><strong>{test['accuracy']:.1%}</strong><small>All 173 test tasks</small></div><div><span>MACRO F1</span><strong>{test['macro_f1']:.3f}</strong><small>Equal weight across five categories</small></div><div><span>AUTO-ACCEPT COVERAGE</span><strong>{routing['auto_accept_coverage']:.1%}</strong><small>{routing['auto_accept_count']} accepted · {accepted_accuracy}</small></div></div>""")
            auto = classifier.thresholds['auto_accept']
            policy = f"Auto-accept at {auto:.0%} or above" if auto is not None else 'Automatic acceptance is disabled'
            gr.Markdown(f"**Frozen routing policy:** {policy}; escalate below {classifier.thresholds['escalate']:.0%}. Between these boundaries, request ordinary review. Zero known vocabulary always escalates. Thresholds were selected on validation only; probabilities are uncalibrated.")
            report = test['classification_report']
            gr.Dataframe(value=[[name.title(), f"{report[name]['precision']:.1%}", f"{report[name]['recall']:.1%}", f"{report[name]['f1-score']:.3f}", int(report[name]['support'])] for name in classifier.classes],
                         headers=['Category','Precision','Recall','F1','Test tasks'], interactive=False, label='Per-category results')
            gr.Markdown('**Read the weak spot:** SOFTWARE recall is 53.8% on only 13 tasks from one occupation. The overall score does not establish reliable software-job classification.')
            with gr.Accordion('Full evaluation report', open=False):
                gr.JSON(value=METRICS, label='Frozen evaluation report')
            gr.Markdown('### Where this evidence stops\nThe five-category mapping is a project decision. Other occupations are excluded, and there is no OTHER class. Exact duplicates were removed, but related wording can remain. Task statements differ from real job ads. A high score does not establish real-world suitability or reliable out-of-scope detection.\n\nData: [O*NET® 31.0](https://www.onetcenter.org/database.html), adapted under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). USDOL/ETA has not endorsed these modifications.')
        with gr.Tab('04 System'):
            gr.Markdown('### Follow the decision through the system\nA small, inspectable architecture: the interface collects intent, the model suggests, and the workflow commits a decision with its evidence.')
            gr.HTML((ROOT / 'diagrams.svg').read_text(), elem_id='system-diagram')
            gr.File(value=str(ROOT / 'diagrams.svg'), label='Download the architecture diagram to inspect at full size', interactive=False)
            with gr.Accordion('Design decisions and reference review', open=False):
                gr.Markdown((ROOT / 'DESIGN_AND_ARCHITECTURE.md').read_text().replace('![Architecture, routing and review states](diagrams.svg)', ''))
        with gr.Tab('05 Case study'):
            gr.Markdown((ROOT / 'BSA_CASE_STUDY.md').read_text())
        gr.HTML('<footer id="disclosure"><strong>PabloRod11</strong> · Independent BSA case study<br>Session data is temporary. No stakeholder interviews, business sign-off, production authentication, or SLA notifications are claimed.</footer>')
        targets = [queue, item_select, selected, record, history, overview, detail]
        run.click(classify_view, [description, session], [probabilities, decision, *targets], api_name='classify')
        guided.click(guided_demo, session, [probabilities, decision, *targets], api_name=False)
        item_select.change(select_view, [item_select, session], [selected, record, history, detail], api_name=False)
        refresh.click(select_view, [item_select, session], [selected, record, history, detail], api_name=False)
        identity.change(role_guidance, identity, guidance, api_name=False)
        for button, action in [(claim,'claim'),(resolve,'resolve'),(escalate,'escalate'),(out,'out_of_scope')]:
            def invoke(selection, who, category, why, path, action=action):
                return review_view(action, selection, who, category, why, path)
            button.click(invoke, [selected, identity, label, reason, session], targets, api_name=False)
        export.click(export_feedback, session, feedback, api_name=False)
    return demo


def make_theme():
    return gr.themes.Base(primary_hue='teal', neutral_hue='slate', font=['Inter','Arial','sans-serif']).set(
        body_background_fill='*neutral_50', body_background_fill_dark='*neutral_950',
        block_background_fill='*background_fill_primary', block_background_fill_dark='*background_fill_primary',
        block_label_background_fill='transparent', block_label_background_fill_dark='transparent',
        block_label_text_color='*body_text_color', block_label_text_color_dark='*body_text_color',
        block_label_shadow='none', block_shadow='none', block_shadow_dark='none',
        button_primary_shadow='none', button_primary_shadow_dark='none',
        button_secondary_shadow='none', button_secondary_shadow_dark='none',
        input_shadow='none', input_shadow_dark='none', block_radius='12px', input_radius='8px',
        button_large_radius='8px', button_large_text_size='15px')


if __name__ == '__main__':
    build_app().launch(server_name=os.environ.get('GRADIO_SERVER_NAME', '0.0.0.0' if os.environ.get('SPACE_ID') else '127.0.0.1'),
                       server_port=int(os.environ.get('GRADIO_SERVER_PORT', '7860')),
                       css=CSS, theme=make_theme(), footer_links=['gradio','settings'], run_history=False)
