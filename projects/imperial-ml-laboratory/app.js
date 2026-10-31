/* Pure model inference is exported for parity tests; page code is a separate layer. */
function infer(weights, pixels) {
  if (!Array.isArray(pixels) || pixels.length !== 64 || pixels.some(x => !Number.isFinite(x) || x < 0 || x > 1)) {
    throw new Error('Expected 64 finite pixel values between zero and one.');
  }
  const hidden = weights['0.weight'].map((row, i) => Math.max(0,
    row.reduce((value, weight, j) => value + weight * pixels[j], weights['0.bias'][i])));
  const logits = weights['2.weight'].map((row, i) =>
    row.reduce((value, weight, j) => value + weight * hidden[j], weights['2.bias'][i]));
  const maximum = Math.max(...logits);
  const exponentials = logits.map(value => Math.exp(value - maximum));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / denominator);
}

async function initialize() {
  const byId = id => document.getElementById(id);
  try {
    const response = await fetch('showcase.json');
    if (!response.ok) throw new Error('The model artifact could not be loaded.');
    const data = await response.json();
    let sampleIndex = 0;
    let pixels = [];
    let drawing = false;
    let pointerDown = false;
    let cursor = [3, 3];
    const canvas = byId('digit');
    const context = canvas.getContext('2d');

    function paint() {
      const cell = canvas.width / 8;
      pixels.forEach((value, i) => {
        const intensity = Math.round(value * 255);
        context.fillStyle = `rgb(${intensity},${intensity},${intensity})`;
        context.fillRect((i % 8) * cell, Math.floor(i / 8) * cell, cell, cell);
      });
      if (drawing && document.activeElement === canvas) {
        context.strokeStyle = '#65a6ff';
        context.lineWidth = 3;
        context.strokeRect(cursor[0] * cell + 2, cursor[1] * cell + 2, cell - 4, cell - 4);
      }
    }

    function resetPrediction() {
      byId('error').textContent = '';
      byId('predicted').textContent = '—';
      byId('score').textContent = 'Ready when you are';
      byId('comparison').textContent = drawing ? 'Custom drawing; no dataset label.' : 'Classify to reveal the dataset label.';
      document.querySelectorAll('.bar').forEach(bar => bar.style.width = '0');
      document.querySelectorAll('.value').forEach(value => value.textContent = '—');
      document.querySelectorAll('.probability').forEach(row => row.classList.remove('best'));
    }

    function selectSample() {
      drawing = false;
      pixels = [...data.samples[sampleIndex].pixels];
      byId('sample-count').textContent = `${sampleIndex + 1} / ${data.samples.length}`;
      byId('input-description').textContent = `Reserved test image ${data.samples[sampleIndex].id}. Its label is revealed after prediction.`;
      byId('drawing-note').hidden = true;
      byId('clear').hidden = byId('use-sample').hidden = true;
      byId('previous').disabled = byId('next').disabled = false;
      paint();
      resetPrediction();
    }

    function shade(x, y, erase = false) {
      cursor = [Math.max(0, Math.min(7, x)), Math.max(0, Math.min(7, y))];
      pixels[cursor[1] * 8 + cursor[0]] = erase ? 0 : 1;
      paint();
      resetPrediction();
    }

    function shadePointer(event) {
      const bounds = canvas.getBoundingClientRect();
      shade(Math.floor((event.clientX - bounds.left) / bounds.width * 8),
        Math.floor((event.clientY - bounds.top) / bounds.height * 8), event.shiftKey);
    }

    canvas.addEventListener('pointerdown', event => {
      if (!drawing) return;
      pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      shadePointer(event);
    });
    canvas.addEventListener('pointermove', event => {
      if (drawing && pointerDown) shadePointer(event);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, () => pointerDown = false));
    canvas.addEventListener('keydown', event => {
      if (!drawing) return;
      const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
      if (directions[event.key]) {
        event.preventDefault();
        cursor = cursor.map((value, i) => Math.max(0, Math.min(7, value + directions[event.key][i])));
        paint();
      } else if ([' ', 'Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); shade(...cursor, event.key !== ' ' || event.shiftKey); }
    });
    canvas.addEventListener('focus', paint);
    canvas.addEventListener('blur', paint);
    byId('draw').onclick = () => {
      drawing = true;
      pixels = Array(64).fill(0);
      byId('clear').hidden = byId('use-sample').hidden = false;
      byId('drawing-note').hidden = false;
      byId('previous').disabled = byId('next').disabled = true;
      byId('sample-count').textContent = 'Custom input';
      byId('input-description').textContent = 'Shade the 8 × 8 grid. Leave a dark margin around the digit.';
      canvas.focus(); paint(); resetPrediction();
    };
    byId('clear').onclick = () => { pixels.fill(0); paint(); resetPrediction(); };
    byId('use-sample').onclick = selectSample;
    byId('previous').onclick = () => { sampleIndex = (sampleIndex + data.samples.length - 1) % data.samples.length; selectSample(); };
    byId('next').onclick = () => { sampleIndex = (sampleIndex + 1) % data.samples.length; selectSample(); };
    byId('classify').onclick = () => {
      if (pixels.every(value => value === 0)) { byId('error').textContent = 'The input is blank. Select a sample or draw a digit.'; return; }
      byId('error').textContent = '';
      const probabilities = infer(data.model, pixels);
      const prediction = probabilities.indexOf(Math.max(...probabilities));
      byId('predicted').textContent = prediction;
      byId('score').textContent = `${(probabilities[prediction] * 100).toFixed(1)}% model score`;
      byId('comparison').textContent = drawing ? 'Custom input: dataset label unavailable.' :
        `Dataset label: ${data.samples[sampleIndex].label} · ${prediction === data.samples[sampleIndex].label ? 'Correct' : 'Incorrect'} on this image`;
      probabilities.forEach((probability, digit) => {
        byId(`bar-${digit}`).style.width = `${probability * 100}%`;
        byId(`value-${digit}`).textContent = `${(probability * 100).toFixed(1)}%`;
        byId(`row-${digit}`).classList.toggle('best', digit === prediction);
      });
    };

    function table(container, headings, rows) {
      const element = document.createElement('table');
      const head = element.createTHead().insertRow();
      headings.forEach(text => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = text; head.append(cell); });
      const body = element.createTBody();
      rows.forEach(values => { const row = body.insertRow(); values.forEach(text => row.insertCell().textContent = text); });
      byId(container).replaceChildren(element);
    }

    function chart(history) {
      const svg = byId('learning-chart');
      const maximum = Math.max(...history.flatMap(row => [row.train_loss, row.validation_loss]));
      const x = i => 55 + i / Math.max(1, history.length - 1) * 810;
      const y = value => 220 - value / maximum * 195;
      let markup = '';
      for (let tick = 0; tick <= 4; tick++) {
        const value = maximum * tick / 4;
        markup += `<line x1="55" x2="865" y1="${y(value)}" y2="${y(value)}" stroke="#dbe0e8"/><text x="8" y="${y(value) + 4}" font-size="12" fill="#596579">${value.toFixed(2)}</text>`;
      }
      ['train_loss', 'validation_loss'].forEach((field, index) => {
        markup += `<polyline fill="none" stroke="${index ? '#677487' : '#3456c0'}" stroke-width="2.5" points="${history.map((row, i) => `${x(i)},${y(row[field])}`).join(' ')}"/>`;
      });
      markup += `<text x="55" y="250" font-size="12" fill="#596579">Epoch 1</text><text x="810" y="250" font-size="12" fill="#596579">Epoch ${history.length}</text>`;
      svg.innerHTML = markup;
    }

    for (let digit = 0; digit < 10; digit++) {
      const row = document.createElement('div'); row.className = 'probability'; row.id = `row-${digit}`;
      row.innerHTML = `<span>${digit}</span><div class="track"><div id="bar-${digit}" class="bar"></div></div><span id="value-${digit}" class="value">—</span>`;
      byId('probabilities').append(row);
    }
    const evaluation = data.evaluation;
    byId('test-accuracy').textContent = `${(evaluation.accuracy * 100).toFixed(1)}%`;
    byId('test-count').textContent = evaluation.samples;
    byId('best-epoch').textContent = evaluation.selected_epoch;
    byId('recovery-status').textContent = data.verification.recovery?.model_weights_exactly_equal ? 'Exact match' : 'See evidence';
    byId('identity').textContent = `Run: ${data.run_id}\nCheckpoint SHA-256: ${data.model_version}`;
    byId('split-details').textContent = `${data.dataset.train_samples} train / ${data.dataset.validation_samples} validation / ${data.dataset.test_samples} test`;
    chart(data.history);
    table('class-results', ['Digit', 'Test examples', 'Precision', 'Recall', 'F1', 'Confusion row (predictions 0–9)'],
      evaluation.per_class.map(row => [row.digit, row.support, (row.precision * 100).toFixed(1) + '%', (row.recall * 100).toFixed(1) + '%', row.f1.toFixed(3), evaluation.confusion_matrix[row.digit].join(' / ')]));
    if (data.benchmark?.medians) {
      const benchmark = data.benchmark;
      byId('benchmark-method').textContent = 'Measured runs with equal global batch size, padded training samples, and optimizer steps. Wall time includes process startup, evaluation and checkpoint writes.';
      table('benchmark-results', ['Workers', 'Median total time', 'Median total training time', 'Test accuracy'], [1, 2].map(workers => {
        const row = benchmark.medians[String(workers)];
        return [workers, `${row.wall_seconds.toFixed(2)}s`, `${row.train_seconds.toFixed(2)}s`, `${(row.accuracy * 100).toFixed(1)}%`];
      }));
    }
    byId('runtime-note').textContent = 'Local measurements use trusted generated artifacts under Intel macOS/PyTorch 2.2.2. Supported Linux/PyTorch ≥2.6 and multi-node execution remain unverified.';
    const interval = evaluation.accuracy_wilson95.map(value => (value * 100).toFixed(1) + '%').join('–');
    byId('limitations').textContent = `Test accuracy 95% Wilson interval: ${interval}. This describes sample uncertainty, not performance on photographs or new handwriting domains. The split is reserved within the revised pipeline; earlier project iterations used the same public dataset.`;
    for (const text of [
      `Recorded ${data.history.length} epochs with minimum-validation-loss model selection.`,
      'Controlled worker restart restored model and optimizer state.',
      `Recovery model equivalence: ${data.verification.recovery?.model_weights_exactly_equal ? 'verified exactly' : 'see exported evidence'}.`,
      'Code and behavior checks are included in the source bundle; CI configuration is supplied, remote CI execution is not claimed.'
    ]) { const item = document.createElement('li'); item.textContent = text; byId('verification').append(item); }
    document.querySelectorAll('.tab').forEach(button => button.onclick = () => {
      document.querySelectorAll('.tab').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-pressed', tab === button ? 'true' : 'false'); });
      document.querySelectorAll('.view').forEach(view => view.hidden = view.id !== button.dataset.view);
    });
    selectSample();
    byId('classify').disabled = false;
  } catch (error) { byId('error').textContent = error.message; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {infer};
else initialize();
