import {
  STEP_KEYS, problemError, parseProblem, problemKey, planDivision,
  nextPos, prevPos, expectedValue, encodePos, decodePos, locate,
} from './division.js';
import {
  BEATS, introScript, stepScript, doneScript, ladderScript, feedback,
  problemParts, line, num, nums,
} from './script.js';
import { Speaker } from './speech.js';

const EXAMPLES = ['943/3', '937/5', '1074/15'];
const BEAT_VARS = ['--divide', '--multiply', '--subtract', '--bringdown'];
const SETTINGS_KEY = 'mathHelper.settings';
const DONE_KEY = 'mathHelper.finished';

const $ = (id) => document.getElementById(id);
const speaker = new Speaker();
const settings = loadSettings();
const state = { set: [], plan: null, pos: null, ladder: null };

const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

// ---------- Storage (per-browser conveniences only) ----------

function loadSettings() {
  const defaults = { rate: 0.9, autoRead: true, voiceURI: null };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

function finishedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}

function markFinished(key) {
  const done = finishedSet();
  done.add(key);
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* private mode */ }
}

// ---------- URL routing ----------
// ?set=943/3,937/5   problems from a teacher link
// &p=943/3           the problem being worked
// &at=2.3            round 2, step 3 (or "done"); missing = intro
// &lost              the "Where am I?" questions

function readUrl() {
  const params = new URLSearchParams(location.search);
  const set = (params.get('set') || '')
    .split(',')
    .map(parseProblem)
    .filter(Boolean)
    .map(problemKey);
  return {
    set: [...new Set(set)],
    problem: parseProblem(params.get('p')),
    at: params.get('at'),
    lost: params.has('lost'),
  };
}

function buildQuery(params) {
  const parts = [];
  for (const [k, v] of params) {
    const value = encodeURIComponent(v).replace(/%2F/gi, '/').replace(/%2C/gi, ',');
    parts.push(v === '' ? k : `${k}=${value}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function go(changes, { push = false, speak = true } = {}) {
  const params = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  const url = location.pathname + buildQuery(params);
  history[push ? 'pushState' : 'replaceState'](null, '', url);
  route({ speak });
}

function route({ speak = false } = {}) {
  const u = readUrl();
  state.set = u.set;
  speaker.stop();
  if (!u.problem) {
    state.plan = null;
    showHome();
    return;
  }
  if (!state.plan || problemKey(state.plan) !== problemKey(u.problem)) {
    state.plan = planDivision(u.problem.dividend, u.problem.divisor);
    state.ladder = null;
  }
  if (u.lost) {
    showLadder(speak);
    return;
  }
  state.ladder = null;
  state.pos = decodePos(state.plan, u.at);
  showCoach(speak);
}

function showView(id) {
  for (const v of ['home', 'coach', 'ladder']) $(v).hidden = v !== id;
  const top = $('topProblem');
  top.replaceChildren();
  if (state.plan && id !== 'home') top.append(sayEl(problemParts(state.plan)));
  window.scrollTo({ top: 0 });
}

// ---------- Spoken text ----------

// Turns script parts into a <p> whose words can be highlighted as they're read.
function sayEl(parts, tag = 'p') {
  const el = document.createElement(tag);
  el.className = 'say';
  let said = '';
  const addWord = (show, spoken, isNum) => {
    const span = document.createElement('span');
    span.className = isNum ? 'w num' : 'w';
    span.textContent = show;
    span.dataset.start = said.length;
    said += spoken;
    span.dataset.end = said.length;
    el.append(span);
  };
  for (const part of parts.flat(Infinity)) {
    if (typeof part === 'string') {
      for (const piece of part.split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) {
          el.append(piece);
          said += piece;
        } else {
          addWord(piece, piece, false);
        }
      }
    } else {
      addWord(part.show, part.say, part.num);
    }
  }
  el.dataset.say = said;
  return el;
}

function block(kind, parts, { speakable = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `block ${kind}`;
  const p = sayEl(parts);
  if (speakable) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'speak';
    b.innerHTML = ICON_SPEAKER;
    b.setAttribute('aria-label', 'Read this out loud');
    b.addEventListener('click', () => speaker.play([p]));
    wrap.append(b);
  }
  wrap.append(p);
  return { wrap, p };
}

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${className}`;
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---------- Home ----------

function showHome() {
  showView('home');
  const done = finishedSet();

  $('assigned').hidden = state.set.length === 0;
  $('assignedList').replaceChildren(
    ...state.set.map((key) => chip(key, done.has(key))),
  );
  $('exampleList').replaceChildren(...EXAMPLES.map((key) => chip(key, false)));
  $('entryError').textContent = '';
}

function chip(key, isDone) {
  const [a, b] = key.split('/');
  const c = document.createElement('button');
  c.type = 'button';
  c.className = isDone ? 'chip done' : 'chip';
  c.textContent = `${a} ÷ ${b}`;
  c.addEventListener('click', () => {
    $('dividendInput').value = a;
    $('divisorInput').value = b;
    go({ p: key, at: null, lost: null }, { push: true });
  });
  return c;
}

$('entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const a = $('dividendInput').value.trim();
  const b = $('divisorInput').value.trim();
  const error = problemError(a, b);
  $('entryError').textContent = error || '';
  if (error) return;
  const key = `${Number(a)}/${Number(b)}`;
  const lost = e.submitter?.value === 'lost';
  go({ p: key, at: null, lost: lost ? '' : null }, { push: true });
});

$('makeLink').addEventListener('click', () => {
  const items = $('setInput').value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const bad = items.filter((s) => !parseProblem(s));
  const keys = [...new Set(items.map(parseProblem).filter(Boolean).map(problemKey))];
  $('setError').textContent = bad.length
    ? `Check these: ${bad.join(', ')}. Write each one like 943/3.`
    : keys.length ? '' : 'Type at least one problem, like 943/3.';
  if (bad.length || !keys.length) {
    $('linkOut').hidden = true;
    return;
  }
  $('linkText').value = `${location.origin}${location.pathname}?set=${keys.join(',')}`;
  $('linkOut').hidden = false;
});

$('copyLink').addEventListener('click', async () => {
  const input = $('linkText');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand?.('copy');
  }
  $('copyLink').textContent = 'Copied!';
  setTimeout(() => { $('copyLink').textContent = 'Copy'; }, 1800);
});

$('brand').addEventListener('click', (e) => {
  e.preventDefault();
  go({ p: null, at: null, lost: null }, { push: true });
});

// ---------- Coach ("Keep the Beat") ----------

function showCoach(speak) {
  showView('coach');
  const { plan, pos } = state;
  $('ring').innerHTML = ringSvg(plan, pos);
  $('diagram').innerHTML = diagramSvg(plan, pos);

  const card = $('stepCard');
  card.replaceChildren();
  let readable = [];

  if (pos.kind === 'step') {
    readable = renderStep(card, plan, pos);
  } else {
    const script = pos.kind === 'intro' ? introScript(plan) : doneScript(plan);
    card.style.setProperty('--beat', pos.kind === 'done' ? 'var(--bringdown)' : 'var(--ink)');
    card.append(stepHead(pos.kind === 'done' ? '✓' : '✎', script.title, ''));
    for (const b of script.blocks) {
      const { wrap, p } = block(b.kind, b.parts);
      card.append(wrap);
      readable.push(p);
    }
    if (pos.kind === 'done') {
      markFinished(problemKey(plan));
      card.append(answerCheck(plan));
    }
  }

  const back = prevPos(plan, pos);
  $('backBtn').disabled = !back;
  $('readBtn').innerHTML = `${ICON_SPEAKER} Read again`;
  $('readBtn').onclick = () => speaker.play(readable);
  $('lostBtn').hidden = pos.kind === 'done';

  const next = $('nextBtn');
  if (pos.kind === 'done') {
    const nextKey = nextInSet();
    next.innerHTML = nextKey ? 'Next problem <span aria-hidden="true">→</span>' : 'New problem';
    next.onclick = () => (nextKey
      ? go({ p: nextKey, at: null, lost: null }, { push: true })
      : go({ p: null, at: null, lost: null }, { push: true }));
  } else {
    const isFinish = pos.kind === 'step' && nextPos(plan, pos).kind === 'done';
    const label = pos.kind === 'intro' ? 'Start' : isFinish ? 'Finish' : 'I did it';
    next.innerHTML = `${label} <span aria-hidden="true">→</span>`;
    next.onclick = () => moveTo(nextPos(plan, pos));
  }

  if (speak && settings.autoRead) speaker.play(readable);
}

function stepHead(symbol, title, right) {
  const head = document.createElement('div');
  head.className = 'step-head';
  head.innerHTML = `<span class="step-symbol" aria-hidden="true">${symbol}</span><h2 class="step-name">${title}</h2><span class="step-round">${right}</span>`;
  return head;
}

function renderStep(card, plan, pos) {
  const beat = BEATS[pos.step];
  const script = stepScript(plan, pos.round, pos.step);
  card.style.setProperty('--beat', `var(${BEAT_VARS[pos.step]})`);
  card.append(stepHead(beat.symbol, beat.label, `Round ${pos.round + 1} of ${plan.rounds.length}`));

  const readable = [];
  for (const b of script.blocks) {
    const { wrap, p } = block(b.kind, b.parts);
    card.append(wrap);
    readable.push(p);
  }

  const feedbackSlot = document.createElement('div');
  card.append(feedbackSlot);

  let tip = null;
  if (script.tip) {
    tip = block('tip', script.tip);
    tip.wrap.hidden = true;
    card.append(tip.wrap);
  }

  if (script.check) {
    const form = document.createElement('form');
    form.className = 'check';
    form.noValidate = true;
    form.innerHTML = `
      <label for="checkInput">${script.check} <span class="optional">(optional)</span></label>
      <input id="checkInput" inputmode="numeric" autocomplete="off" maxlength="7">
      <button class="btn" type="submit">Check my number</button>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = form.querySelector('input').value.trim();
      if (!/^\d+$/.test(value)) {
        form.querySelector('input').focus();
        return;
      }
      const right = Number(value) === expectedValue(plan, pos);
      const msg = block(`feedback ${right ? 'good' : 'bad'}`, right ? feedback.right : (tip ? feedback.wrong : feedback.wrongNoTip), { speakable: false });
      feedbackSlot.replaceChildren(msg.wrap);
      const toRead = [msg.p];
      if (!right && tip) {
        tip.wrap.hidden = false;
        toRead.push(tip.p);
        tipToggle.hidden = true;
      }
      speaker.play(toRead);
    });
    card.append(form);
  }

  const tipToggle = document.createElement('button');
  tipToggle.type = 'button';
  tipToggle.className = 'link-btn';
  tipToggle.textContent = 'Show a tip';
  tipToggle.hidden = !tip;
  tipToggle.addEventListener('click', () => {
    tip.wrap.hidden = false;
    tipToggle.hidden = true;
    speaker.play([tip.p]);
  });
  card.append(tipToggle);

  return readable;
}

function answerCheck(plan) {
  const form = document.createElement('form');
  form.className = 'check';
  form.noValidate = true;
  form.innerHTML = `
    <label for="answerInput">Answer</label>
    <input id="answerInput" inputmode="numeric" autocomplete="off" maxlength="6">
    <label for="remainderInput">Remainder</label>
    <input id="remainderInput" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="0">
    <button class="btn" type="submit">Check my answer</button>`;
  const slot = document.createElement('div');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = form.querySelector('#answerInput').value.trim();
    const r = form.querySelector('#remainderInput').value.trim() || '0';
    if (!/^\d+$/.test(a) || !/^\d+$/.test(r)) {
      form.querySelector('#answerInput').focus();
      return;
    }
    const right = Number(a) === plan.quotient && Number(r) === plan.remainder;
    const msg = block(`feedback ${right ? 'good' : 'bad'}`, right ? feedback.answerRight : feedback.answerWrong, { speakable: false });
    slot.replaceChildren(msg.wrap);
    speaker.play([msg.p]);
  });
  const wrap = document.createElement('div');
  wrap.append(form, slot);
  return wrap;
}

function nextInSet() {
  if (!state.plan) return null;
  const i = state.set.indexOf(problemKey(state.plan));
  return i >= 0 && i < state.set.length - 1 ? state.set[i + 1] : null;
}

function moveTo(pos) {
  if (!pos) return;
  go({ at: encodePos(pos), lost: null });
}

$('backBtn').addEventListener('click', () => moveTo(prevPos(state.plan, state.pos)));
$('lostBtn').addEventListener('click', () => {
  state.ladder = null;
  go({ lost: '' }, { push: true });
});

document.addEventListener('keydown', (e) => {
  if ($('coach').hidden || $('settings').open) return;
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') $('nextBtn').click();
  else if (e.key === 'ArrowLeft' && !$('backBtn').disabled) $('backBtn').click();
});

// The four-beat ring: Divide at top, then clockwise.
function ringSvg(plan, pos) {
  const cx = 160, cy = 160, R = 112;
  const rad = (a) => (a * Math.PI) / 180;
  const at = (a) => [cx + R * Math.cos(rad(a)), cy + R * Math.sin(rad(a))];

  const arrows = [-45, 45, 135, 225].map((a) => {
    const [x, y] = at(a);
    return `<path class="arrow" d="M-7 -8 L8 0 L-7 8 Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a + 90})"/>`;
  }).join('');

  const nodes = BEATS.map((beat, i) => {
    const [x, y] = at(-90 + i * 90);
    let cls = 'node';
    if (pos.kind === 'step' && i === pos.step) cls += ' active';
    else if (pos.kind === 'done' || (pos.kind === 'step' && i < pos.step)) cls += ' past';
    return `<g class="${cls}" style="--beat: var(${BEAT_VARS[i]})" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle r="46"/>
      <text class="sym" y="4">${beat.symbol}</text>
      <text class="lbl" y="25">${beat.label}</text>
    </g>`;
  }).join('');

  let small = 'Round';
  let big = `${pos.round + 1} of ${plan.rounds.length}`;
  if (pos.kind === 'intro') { small = 'Every round'; big = '4 steps'; }
  if (pos.kind === 'done') { small = 'All rounds'; big = 'Done!'; }

  const label = pos.kind === 'step'
    ? `Step ${pos.step + 1} of 4: ${BEATS[pos.step].label}. Round ${pos.round + 1} of ${plan.rounds.length}.`
    : 'The four steps: Divide, Multiply, Subtract, Bring down.';

  return `<svg viewBox="0 0 320 320" role="img" aria-label="${label}">
    <circle class="track" cx="${cx}" cy="${cy}" r="${R}"/>
    ${arrows}${nodes}
    <text class="center-small" x="${cx}" y="${cy - 8}">${small}</text>
    <text class="center-big" x="${cx}" y="${cy + 26}">${big}</text>
  </svg>`;
}

// A sketch of the problem on paper showing where to look for this step.
// It never shows numbers the student hasn't worked out yet.
function diagramSvg(plan, pos) {
  const cw = 40;
  const divisorText = String(plan.divisor);
  const bracketX = 16 + divisorText.length * 22 + 10;
  const colX = (i) => bracketX + 16 + cw * (i + 0.5);
  const n = plan.digits.length;
  const width = bracketX + 16 + cw * n + 12;
  const qy = 8, barY = 60, digitY = 102, workY = 136, height = 230;

  const step = pos.kind === 'step' ? STEP_KEYS[pos.step] : pos.kind;
  const round = pos.kind === 'step' ? plan.rounds[pos.round] : null;
  const lastBring = step === 'bringDown' && round.bringIndex == null;
  const beat = pos.kind === 'step' ? `var(${BEAT_VARS[pos.step]})` : 'var(--bringdown)';

  const out = [];

  // Quotient boxes, one above each digit that gets an answer digit.
  plan.rounds.forEach((r, k) => {
    const x = colX(r.endIndex) - 16;
    const written = pos.kind === 'done' || (pos.kind === 'step' && (k < pos.round || (k === pos.round && pos.step > 0)));
    const hot = (pos.kind === 'step' && k === pos.round && (step === 'divide' || step === 'multiply')) || lastBring || pos.kind === 'done';
    let cls = 'qbox';
    if (written) cls += ' filled';
    if (hot) cls += ' hot';
    if (hot && step === 'divide') cls += ' pulse';
    out.push(`<rect class="${cls}" x="${x}" y="${qy}" width="32" height="42" rx="8"/>`);
  });
  if (lastBring || pos.kind === 'done') out.push(label(colX(plan.rounds.at(-1).endIndex) + 30, qy + 26, 'answer', 'side'));

  // Division bracket and bar.
  out.push(`<text class="digit" x="${bracketX - 12 - (divisorText.length * 22) / 2}" y="${digitY}">${divisorText}</text>`);
  out.push(`<path class="bar" d="M${bracketX} ${barY} Q ${bracketX + 12} ${barY + 26} ${bracketX} ${barY + 54}"/>`);
  out.push(`<path class="bar" d="M${bracketX} ${barY} H ${width - 8}"/>`);

  // Highlight behind dividend digits.
  const span = (from, to, cls) => `<rect class="${cls}" x="${colX(from) - cw / 2 + 2}" y="${barY + 6}" width="${cw * (to - from + 1) - 4}" height="50" rx="8"/>`;
  if (step === 'divide' && pos.round === 0) out.push(span(0, plan.prefixLen - 1, 'hot-digit'));
  if (step === 'bringDown' && !lastBring) out.push(span(round.bringIndex, round.bringIndex, 'hot-digit'));

  plan.digits.forEach((d, i) => {
    out.push(`<text class="digit" x="${colX(i)}" y="${digitY}">${d}</text>`);
  });

  // Work area under the problem, sized to the student's current number.
  if (round) {
    const len = String(round.number).length;
    const from = Math.max(0, round.endIndex - len + 1);
    const to = round.endIndex;
    const box = (y, cls) => `<rect class="qbox hot ${cls || ''}" x="${colX(from) - cw / 2 + 4}" y="${y}" width="${cw * (to - from + 1) - 8}" height="40" rx="8"/>`;

    if (step === 'divide' && pos.round > 0) {
      out.push(box(workY));
      out.push(label((colX(from) + colX(to)) / 2, workY + 62, 'your number'));
    }
    if (step === 'multiply') {
      out.push(box(workY, 'pulse'));
      out.push(label((colX(from) + colX(to)) / 2, workY + 62, 'write it here'));
    }
    if (step === 'subtract') {
      out.push(`<path class="hot-line" d="M${colX(from) - cw / 2} ${workY - 4} H ${colX(to) + cw / 2}"/>`);
      out.push(box(workY + 6, 'pulse'));
      out.push(label((colX(from) + colX(to)) / 2, workY + 68, 'line, then answer'));
    }
    if (step === 'bringDown' && !lastBring) {
      const x = colX(round.bringIndex);
      out.push(`<path class="hot-line" d="M${x} ${barY + 58} V ${workY + 2}"/>`);
      out.push(`<path class="arrow-head" style="fill: var(--beat)" d="M${x - 8} ${workY - 6} L${x} ${workY + 6} L${x + 8} ${workY - 6} Z"/>`);
      out.push(`<rect class="qbox hot pulse" x="${x - 16}" y="${workY + 10}" width="32" height="40" rx="8"/>`);
      out.push(label(x, workY + 74, 'bring it down'));
    }
    if (lastBring) {
      out.push(box(workY));
      out.push(label((colX(from) + colX(to)) / 2, workY + 62, 'remainder'));
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" style="--beat: ${beat}" role="img" aria-label="A sketch of the problem showing where to look for this step.">${out.join('')}</svg>`;

  function label(x, y, text, where) {
    const anchor = where === 'side' ? 'start' : 'middle';
    return `<text class="hot-text" x="${x}" y="${y}" style="text-anchor:${anchor}">${text}</text>`;
  }
}

// ---------- "Where am I?" ----------

function showLadder(speak) {
  showView('ladder');
  const plan = state.plan;
  if (!state.ladder) state.ladder = { stage: 'count' };
  const L = state.ladder;
  const card = $('ladderCard');
  card.replaceChildren();

  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = 'Where am I?';
  card.append(kicker);

  const readable = [];
  const actions = document.createElement('div');
  actions.className = 'ladder-actions';
  const rerender = () => showLadder(true);
  const cancel = button('Cancel', '', () => {
    state.ladder = null;
    go({ lost: null }, { push: true });
  });

  if (L.stage === 'count') {
    const q = block('question', ladderScript.count(plan));
    card.append(q.wrap);
    readable.push(q.p);
    const options = document.createElement('div');
    options.className = 'count-options';
    for (let n = 0; n <= plan.rounds.length; n++) {
      options.append(button(n === 0 ? 'None' : String(n), '', () => {
        if (n === 0) {
          Object.assign(L, { stage: 'found', pos: locate(plan, 0, null) });
        } else {
          Object.assign(L, { stage: 'mark', topCount: n });
        }
        rerender();
      }));
    }
    card.append(options);
    actions.append(cancel);
  }

  if (L.stage === 'mark') {
    const q = block('question', ladderScript.mark);
    card.append(q.wrap);
    readable.push(q.p);
    const grid = document.createElement('div');
    grid.className = 'mark-options';
    for (const mark of ladderScript.marks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mark-option';
      b.innerHTML = sketchSvg(mark.key);
      const text = sayEl(mark.parts, 'span');
      b.append(text);
      readable.push(text);
      b.addEventListener('click', () => {
        const pos = locate(plan, L.topCount, mark.key);
        Object.assign(L, pos ? { stage: 'found', pos } : { stage: 'lost' });
        rerender();
      });
      grid.append(b);
    }
    card.append(grid);
    actions.append(
      button('<span aria-hidden="true">←</span> Back', '', () => { L.stage = 'count'; rerender(); }),
      button('I\'m not sure', 'lost', () => { L.stage = 'lost'; rerender(); }),
      cancel,
    );
  }

  if (L.stage === 'found') {
    const q = block('question', ladderScript.found(plan, L.pos));
    card.append(q.wrap);
    readable.push(q.p);
    actions.append(
      button('Go there <span aria-hidden="true">→</span>', 'primary big', () => {
        state.ladder = null;
        go({ lost: null, at: encodePos(L.pos) }, { push: true });
      }),
      button('Start over', '', () => { L.stage = 'count'; rerender(); }),
    );
  }

  if (L.stage === 'lost') {
    const q = block('question', ladderScript.lost);
    card.append(q.wrap);
    readable.push(q.p);
    actions.append(
      button('Start this problem again', 'primary big', () => {
        state.ladder = null;
        go({ lost: null, at: null }, { push: true });
      }),
      button('Answer the questions again', '', () => { L.stage = 'count'; rerender(); }),
    );
  }

  card.append(actions);
  if (speak && settings.autoRead) speaker.play(readable);
}

// Tiny pictures of a page of long division for the "last thing you wrote" question.
function sketchSvg(kind) {
  const hot = (k) => (k === kind ? 'hot' : 'box');
  const parts = [
    '<rect class="box" x="6" y="32" width="18" height="20" rx="3"/>',
    '<path class="bar" d="M32 28 Q40 42 32 56 M32 28 H114"/>',
    '<rect class="box" x="40" y="32" width="18" height="20" rx="3"/>',
    '<rect class="box" x="64" y="32" width="18" height="20" rx="3"/>',
    '<rect class="box" x="88" y="32" width="18" height="20" rx="3"/>',
    `<rect class="${hot('top')}" x="40" y="4" width="18" height="18" rx="3"/>`,
  ];
  if (kind !== 'top') parts.push(`<rect class="${hot('under')}" x="40" y="60" width="42" height="16" rx="3"/>`);
  if (kind === 'line' || kind === 'broughtDown') {
    parts.push(`<path class="${kind === 'line' ? 'hot-line' : 'bar'}" d="M38 82 H86"/>`);
    parts.push(`<rect class="${hot('line')}" x="64" y="88" width="18" height="16" rx="3"/>`);
  }
  if (kind === 'broughtDown') {
    parts.push('<path class="hot-line" d="M97 56 V84"/>');
    parts.push('<rect class="hot" x="88" y="88" width="18" height="16" rx="3"/>');
  }
  return `<svg class="sketch" viewBox="0 0 120 110" aria-hidden="true">${parts.join('')}</svg>`;
}

// ---------- Settings ----------

function fillVoices() {
  const select = $('voiceSelect');
  const voices = speaker.voices();
  const current = speaker.pickVoice();
  select.replaceChildren(...voices.map((v) => {
    const o = document.createElement('option');
    o.value = v.voiceURI;
    o.textContent = `${v.name} (${v.lang})`;
    o.selected = current && v.voiceURI === current.voiceURI;
    return o;
  }));
  select.disabled = voices.length === 0;
}

function applySettings() {
  speaker.rate = Number(settings.rate) || 0.9;
  speaker.voiceURI = settings.voiceURI;
}

$('settingsBtn').addEventListener('click', () => {
  const dialog = $('settings');
  for (const r of dialog.querySelectorAll('input[name="rate"]')) r.checked = Number(r.value) === Number(settings.rate);
  $('autoRead').checked = settings.autoRead;
  fillVoices();
  $('voiceSample').hidden = true;
  dialog.showModal();
});

$('settings').addEventListener('change', (e) => {
  if (e.target.name === 'rate') settings.rate = Number(e.target.value);
  if (e.target.id === 'autoRead') settings.autoRead = e.target.checked;
  if (e.target.id === 'voiceSelect') settings.voiceURI = e.target.value;
  applySettings();
  saveSettings();
});

$('testVoice').addEventListener('click', () => {
  const sample = $('voiceSample');
  const fresh = sayEl(line`Hi! I will read each step to you. How many ${nums(3)} fit into ${num(9)}?`);
  sample.replaceChildren(...fresh.childNodes);
  sample.dataset.say = fresh.dataset.say;
  sample.hidden = false;
  speaker.play([sample]);
});

$('settings').addEventListener('close', () => speaker.stop());

// ---------- Start ----------

applySettings();
$('noSpeech').hidden = speaker.supported;
if (speaker.supported) window.speechSynthesis.addEventListener?.('voiceschanged', () => { if ($('settings').open) fillVoices(); });
window.addEventListener('popstate', () => route({ speak: false }));
route({ speak: false });
