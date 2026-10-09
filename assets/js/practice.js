/* =====================================================================
   MATH IT!  —  Practice page controller
   ---------------------------------------------------------------------
   Owns the worksheet lifecycle: generate → answer → mark → reveal → print.

   Worksheets are *seeded*. Every sheet has a short numeric ID baked into
   the URL, so a teacher can hand out a link and every child receives an
   identical sheet — while "New" simply rolls a fresh seed.
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.document;
  const G = global.MathIt.Generator;
  const S = global.MathIt.Settings;

  const qs = (sel, root) => (root || D).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || D).querySelectorAll(sel));

  /* ---------------- seeded RNG (mulberry32) ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function withSeed(seed, fn) {
    const original = Math.random;
    Math.random = mulberry32(seed >>> 0);
    try { return fn(); } finally { Math.random = original; }
  }

  const newSeed = () => Math.floor(Math.random() * 900000) + 100000;

  /* Two pages share this controller: the curriculum worksheet
     (practice.html) and the times-tables drill (tables.html). They differ
     only in how a sheet is generated and what the heading says. */
  const SOURCE = D.body.getAttribute('data-sheet-source') === 'tables' ? 'tables' : 'curriculum';
  const isTables = SOURCE === 'tables';

  /* ---------------- state ---------------- */
  const state = {
    settings: S.load(),
    seed: Number(new URLSearchParams(global.location.search).get('s')) || newSeed(),
    sheet: null,
    revealed: false,
    marked: false,
    elapsed: 0,
    running: false,
    ticker: null,
  };

  /* =================================================================
     Worksheet rendering
     ================================================================= */
  function plainText(html) {
    const tmp = D.createElement('div');
    tmp.innerHTML = html
      .replace(/<span class="frac"><span class="num">(.*?)<\/span><span class="den">(.*?)<\/span><\/span>/g, '$1/$2')
      .replace(/<sup>(.*?)<\/sup>/g, '^$1');
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* Sets the two-column row count and a print density band so a sheet of any
     length still prints on exactly one A4 page. */
  function setRows(total) {
    const rows = Math.ceil(total / 2);
    D.documentElement.style.setProperty('--mi-rows', String(rows));
    D.documentElement.dataset.printDensity =
      rows <= 18 ? 'normal' : rows <= 21 ? 'snug' : rows <= 25 ? 'tight' : 'tighter';
  }

  function questionRow(q, i) {
    const row = D.createElement('div');
    row.className = 'q-item';
    row.setAttribute('data-q', String(i));

    const num = D.createElement('span');
    num.className = 'q-num';
    num.textContent = state.settings.showNumbers ? (i + 1) + '.' : '';
    row.appendChild(num);

    const body = D.createElement('div');
    body.className = 'q-body';

    const expr = D.createElement('span');
    expr.className = 'q-expr' + (q.html.indexOf('q-prompt') !== -1 ? ' q-expr--prompt' : '');
    expr.innerHTML = q.html;
    body.appendChild(expr);

    const placeholderBox = qs('[data-box]', expr);

    if (!placeholderBox && q.equals !== false) {
      const eq = D.createElement('span');
      eq.className = 'q-eq';
      eq.textContent = '=';
      body.appendChild(eq);
    }

    const input = D.createElement('input');
    input.type = 'text';
    input.className = 'q-input' + (q.wide ? ' w-32' : '');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('data-input', String(i));
    input.setAttribute('aria-label', 'Question ' + (i + 1) + ': ' + plainText(q.html));
    input.setAttribute('inputmode',
      (q.type === 'number' && q.topic !== 'negatives') ? 'decimal' : 'text');
    if (q.placeholder) input.placeholder = q.placeholder;

    // Missing-number questions get their answer box rendered *in situ*,
    // exactly where the unknown sits in the equation.
    if (placeholderBox) placeholderBox.parentNode.replaceChild(input, placeholderBox);
    else body.appendChild(input);

    if (q.suffix) {
      const suf = D.createElement('span');
      suf.className = 'text-soft';
      suf.textContent = q.suffix;
      body.appendChild(suf);
    }

    const mark = D.createElement('span');
    mark.className = 'q-mark';
    mark.setAttribute('aria-live', 'polite');
    body.appendChild(mark);

    const sol = D.createElement('span');
    sol.className = 'q-solution';
    sol.innerHTML = q.ansHtml;
    sol.setAttribute('title', 'Answer: ' + q.ansText);
    sol.setAttribute('aria-label', 'Answer: ' + q.ansText);
    body.appendChild(sol);

    if (!state.settings.hideTopicTags) {
      const tag = D.createElement('span');
      tag.className = 'ml-auto hidden shrink-0 pl-2 text-[0.65rem] uppercase tracking-wide text-faint sm:inline';
      tag.textContent = q.topicLabel;
      body.appendChild(tag);
    }

    row.appendChild(body);
    return row;
  }

  function render() {
    const grid = qs('[data-sheet]');
    if (!grid) return;

    grid.innerHTML = '';
    const frag = D.createDocumentFragment();
    state.sheet.questions.forEach(function (q, i) { frag.appendChild(questionRow(q, i)); });
    grid.appendChild(frag);

    setRows(state.sheet.questions.length);

    state.revealed = false;
    state.marked = false;
    syncAnswerButton();
    hideBanner();
    paintMeta();
    bindInputs();
    renderAnswerKey();
    restoreAnswers();
    paintProgress();
  }

  /* =================================================================
     Answer key — shown on screen when "Show the answer key" is on,
     and printed on its own page in answers / both / class-set modes.
     Laid out in four columns, read down the column like the sheet.
     ================================================================= */
  function answerKeyHtml(sheet) {
    return sheet.questions.map(function (q, i) {
      return '<div class="ak-item"><span class="ak-n">' + (i + 1) + '</span>' +
             '<span class="ak-a">' + q.ansHtml + '</span></div>';
    }).join('');
  }

  function renderAnswerKey() {
    const host = qs('[data-answer-key]');
    if (!host || !state.sheet) return;
    host.innerHTML = answerKeyHtml(state.sheet);
  }

  /* =================================================================
     Progress — "12 / 36 answered" plus a thin bar in the toolbar
     ================================================================= */
  function paintProgress() {
    const bar = qs('[data-progress-bar]');
    const text = qs('[data-progress-text]');
    if (!bar && !text) return;
    const inputs = qsa('[data-input]');
    const total = inputs.length;
    const done = inputs.filter(function (i) { return i.value.trim() !== ''; }).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = done + ' / ' + total + ' answered';
  }

  /* =================================================================
     Answer autosave — per seed, for the current tab only, so a stray
     refresh does not wipe ten minutes of work.
     ================================================================= */
  const answerKeyName = () => 'mathit:answers:' + state.seed;

  function saveAnswers() {
    try {
      const vals = qsa('[data-input]').map(function (i) { return i.value; });
      if (vals.join('') === '') global.sessionStorage.removeItem(answerKeyName());
      else global.sessionStorage.setItem(answerKeyName(), JSON.stringify(vals));
    } catch (e) { /* storage disabled */ }
  }

  function restoreAnswers() {
    try {
      const raw = global.sessionStorage.getItem(answerKeyName());
      if (!raw) return;
      const vals = JSON.parse(raw);
      if (!Array.isArray(vals)) return;
      qsa('[data-input]').forEach(function (input, i) {
        if (typeof vals[i] === 'string') input.value = vals[i];
      });
    } catch (e) { /* noop */ }
  }

  function bindInputs() {
    qsa('[data-input]').forEach(function (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (ev.ctrlKey || ev.metaKey) { markSheet(); return; }
          if (!state.settings.autoAdvance) return;
          const i = Number(input.getAttribute('data-input'));
          const next = qs('[data-input="' + (i + 1) + '"]');
          if (next) { next.focus(); next.select(); } else { markSheet(); }
        }
      });
      input.addEventListener('input', function () {
        input.classList.remove('is-correct', 'is-incorrect');
        const row = input.closest('.q-item');
        if (row) {
          const m = qs('.q-mark', row);
          m.className = 'q-mark';
          m.textContent = '';
        }
        paintProgress();
        saveAnswers();
      });
    });
  }

  /* =================================================================
     Meta: titles, breadcrumbs, share link, print header
     ================================================================= */
  const OPS_LABEL = {
    mul: 'Multiplication', div: 'Division', both: 'Multiplication and division',
    missing: 'Missing numbers', all: 'Mixed',
  };

  /** "2, 3, 4 and 7" / "2–12" when the selection is a run. */
  function tablesLabel(list) {
    if (!list || !list.length) return 'no tables';
    if (list.length > 3 && list[list.length - 1] - list[0] === list.length - 1) {
      return list[0] + '–' + list[list.length - 1];
    }
    if (list.length > 6) return list.slice(0, 5).join(', ') + ' + ' + (list.length - 5) + ' more';
    if (list.length === 1) return 'the ' + list[0] + ' times table';
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  /** Short form for printed headers: never longer than a few words, so the
      header can never wrap past two lines and shove the fields off the page. */
  function tablesLabelShort(list) {
    if (!list || !list.length) return 'no tables';
    if (list.length === 1) return list[0] + ' times table';
    const run = list[list.length - 1] - list[0] === list.length - 1;
    if (run) return list[0] + '–' + list[list.length - 1] + ' times tables';
    if (list.length <= 4) return list.join(', ') + ' times tables';
    return list.length + ' times tables';
  }

  /** The printed header, shared by the live sheet and every class-set copy. */
  function headHtml(opts) {
    const esc = function (t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const field = function (label, score) {
      return '<span class="ws-field' + (score ? ' ws-field--score' : '') + '">' +
             '<b>' + label + '</b><i></i>' +
             (score ? '<em>/ ' + score + '</em>' : '') + '</span>';
    };
    return '<header class="ws-head">' +
      '<div class="ws-head-id">' +
        '<p class="ws-head-title">' + esc(opts.title) + '</p>' +
        '<p class="ws-head-sub">' + esc(opts.sub) + '</p>' +
      '</div>' +
      '<div class="ws-head-fields">' +
        field('Name') + field('Class') + field('Date') + field('Score', opts.total) +
      '</div>' +
    '</header>';
  }

  function paintMeta() {
    const s = state.settings;
    const levelLabel = S.LEVEL_LABELS[s.level];
    const title = isTables
      ? (OPS_LABEL[s.tablesOps] + ': ' + tablesLabel(s.tables))
      : ('Year ' + s.year + ' · ' + levelLabel);

    qsa('[data-sheet-title]').forEach((n) => {
      n.textContent = isTables ? ('Times tables · ' + tablesLabel(s.tables)) : (title + ' mental maths');
    });
    qsa('[data-sheet-sub]').forEach((n) => {
      n.textContent = isTables
        ? (s.count + ' questions · ' + OPS_LABEL[s.tablesOps] + ' · ×' + s.tablesMin + ' to ×' + s.tablesMax)
        : (s.count + ' questions · ' + S.LEVEL_BLURB[s.level]);
    });
    qsa('[data-crumb-current]').forEach((n) => { n.textContent = title; });
    qsa('[data-sheet-id]').forEach((n) => { n.textContent = '#' + state.seed; });
    qsa('[data-print-date]').forEach((n) => {
      n.textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    });

    if (isTables) {
      qsa('[data-tables-count]').forEach((n) => {
        n.textContent = s.tables.length + (s.tables.length === 1 ? ' table' : ' tables');
      });
      qsa('[data-pool-size]').forEach((n) => {
        n.textContent = state.sheet ? String(state.sheet.poolSize) : '0';
      });
    } else {
      const topicCount = activeTopicIds().length;
      const available = G.topicsForYear(s.year).length;
      qsa('[data-topic-count]').forEach((n) => { n.textContent = topicCount + ' of ' + available; });
    }

    const share = qs('[data-share-url]');
    if (share) share.value = shareUrl();

    try {
      const url = new URL(global.location.href);
      url.search = isTables
        ? S.tablesUrl(s, state.seed).split('?')[1]
        : (S.toQuery(s) + '&s=' + state.seed);
      global.history.replaceState({}, '', url.toString());
      if (share) share.value = url.toString();
    } catch (e) { /* file:// — history API unavailable */ }

    D.title = isTables
      ? ('Times tables worksheet · ' + title + ' · Sheet #' + state.seed + ' | Math It!')
      : (title + ' maths worksheet · Sheet #' + state.seed + ' | Math It!');
  }

  function shareUrl() {
    return isTables
      ? S.tablesUrl(state.settings, state.seed)
      : (S.practiceUrl(state.settings) + '&s=' + state.seed);
  }

  function activeTopicIds() {
    const all = G.topicsForYear(state.settings.year).map((t) => t.id);
    if (!state.settings.topics) return all;
    const chosen = all.filter((id) => state.settings.topics.indexOf(id) !== -1);
    return chosen.length ? chosen : all;
  }

  /* =================================================================
     Toolbar actions
     ================================================================= */
  function sheetSpec() {
    const s = state.settings;
    if (isTables) {
      return {
        tables: s.tables, ops: s.tablesOps, min: s.tablesMin,
        max: s.tablesMax, count: s.count, inOrder: s.tablesOrder,
      };
    }
    return { year: s.year, level: s.level, count: s.count, topics: activeTopicIds() };
  }

  function generate(spec) {
    return isTables ? G.buildTablesSheet(spec) : G.buildSheet(spec);
  }

  function buildSheet(seed) {
    state.seed = seed || newSeed();
    const spec = sheetSpec();
    state.sheet = withSeed(state.seed, function () { return generate(spec); });
    render();
  }

  function newSheet() {
    buildSheet(newSeed());
    resetTimer(true);
    const first = qs('[data-input="0"]');
    if (first && global.innerWidth >= 768) first.focus();
  }

  function resetSheet() {
    qsa('[data-input]').forEach(function (input) {
      input.value = '';
      input.classList.remove('is-correct', 'is-incorrect');
    });
    qsa('.q-mark').forEach(function (m) { m.className = 'q-mark'; m.textContent = ''; });
    qsa('.q-item').forEach(function (r) { r.classList.remove('is-revealed'); });
    state.revealed = false;
    state.marked = false;
    syncAnswerButton();
    hideBanner();
    resetTimer(true);
    saveAnswers();
    paintProgress();
  }

  function markSheet() {
    if (!state.sheet) return;
    let correct = 0, attempted = 0;
    const wrongTopics = {};

    state.sheet.questions.forEach(function (q, i) {
      const input = qs('[data-input="' + i + '"]');
      const row = input.closest('.q-item');
      const mark = qs('.q-mark', row);
      const raw = input.value.trim();

      input.classList.remove('is-correct', 'is-incorrect');
      mark.className = 'q-mark';
      mark.textContent = '';
      row.classList.remove('is-revealed');

      if (!raw) return;
      attempted++;

      if (G.isCorrect(q, raw)) {
        correct++;
        input.classList.add('is-correct');
        mark.classList.add('is-correct');
        mark.textContent = '✓';
        mark.setAttribute('title', 'Correct');
      } else {
        input.classList.add('is-incorrect');
        mark.classList.add('is-incorrect');
        mark.textContent = '✗';
        mark.setAttribute('title', 'The answer is ' + q.ansText);
        row.classList.add('is-revealed');
        wrongTopics[q.topicLabel] = (wrongTopics[q.topicLabel] || 0) + 1;
      }
    });

    state.marked = true;
    pauseTimer();
    paintProgress();
    recordResult(correct, state.sheet.questions.length);
    showBanner(correct, attempted, wrongTopics);
  }

  function toggleAnswers() {
    state.revealed = !state.revealed;
    qsa('.q-item').forEach(function (r) { r.classList.toggle('is-revealed', state.revealed); });
    syncAnswerButton();
  }

  function syncAnswerButton() {
    qsa('[data-action="answers"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(state.revealed));
      const label = qs('[data-answer-label]', b);
      if (label) label.textContent = state.revealed ? 'Hide answers' : 'Answers';
      b.classList.toggle('btn-amber', state.revealed);
      b.classList.toggle('btn-ghost', !state.revealed);
    });
  }

  /* =================================================================
     Score banner
     ================================================================= */
  function hideBanner() {
    const b = qs('[data-score-banner]');
    if (b) b.classList.add('hidden');
  }

  function showBanner(correct, attempted, wrongTopics) {
    const banner = qs('[data-score-banner]');
    if (!banner) return;
    const total = state.sheet.questions.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;

    const tone = pct >= 85 ? 'good' : pct >= 60 ? 'mid' : 'bad';
    const toneClasses = {
      good: 'border-accent-line bg-accent-soft',
      mid: 'border-warn-line bg-warn-soft',
      bad: 'border-bad-line bg-bad-soft',
    };
    const barClasses = { good: 'bg-accent', mid: 'bg-warn', bad: 'bg-bad' };
    const textClasses = { good: 'text-accent-soft-fg', mid: 'text-warn-soft-fg', bad: 'text-bad-soft-fg' };

    banner.className = 'score-banner mb-6 rounded-xl border p-5 ' + toneClasses[tone];
    banner.classList.remove('hidden');

    const headline = pct >= 95 ? 'Nearly all right.'
      : pct >= 85 ? 'A strong sheet.'
        : pct >= 60 ? 'A few to revisit.'
          : 'Worth going through together.';

    const missed = Object.keys(wrongTopics)
      .sort((a, b) => wrongTopics[b] - wrongTopics[a])
      .slice(0, 4);

    banner.innerHTML =
      '<div class="flex flex-wrap items-start justify-between gap-4">' +
        '<div class="min-w-0">' +
          '<p class="font-display text-2xl ' + textClasses[tone] + '">' + correct + ' / ' + total +
            ' <span class="text-base font-sans font-semibold opacity-70">(' + pct + '%)</span></p>' +
          '<p class="mt-1 text-sm ' + textClasses[tone] + ' opacity-90">' + headline +
            ' ' + attempted + ' of ' + total + ' attempted' +
            (state.elapsed > 0 ? ' in ' + formatTime(state.elapsed) : '') + '.</p>' +
        '</div>' +
        '<div class="flex shrink-0 gap-2">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-action="reset">Try again</button>' +
          '<button type="button" class="btn btn-sm btn-dark" data-action="new">New sheet</button>' +
        '</div>' +
      '</div>' +
      '<div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface">' +
        '<div class="h-full rounded-full ' + barClasses[tone] + ' transition-all duration-700" style="width:' + pct + '%"></div>' +
      '</div>' +
      (missed.length
        ? '<div class="mt-4 flex flex-wrap items-center gap-2">' +
            '<span class="text-xs font-bold uppercase tracking-wider ' + textClasses[tone] + ' opacity-70">Revisit</span>' +
            missed.map((m) => '<span class="chip">' + m + ' · ' + wrongTopics[m] + '</span>').join('') +
          '</div>'
        : '');

    bindActions(banner);
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* =================================================================
     Timer
     ================================================================= */
  function formatTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function paintTimer() {
    const wrap = qs('[data-timer]');
    if (!wrap) return;
    const mode = state.settings.timerMode;
    wrap.classList.toggle('hidden', mode === 'off');
    if (mode === 'off') return;

    const value = qs('[data-timer-value]', wrap);
    let shown = state.elapsed;
    if (mode === 'countdown') shown = Math.max(0, state.settings.countdownMins * 60 - state.elapsed);
    value.textContent = formatTime(shown);
    const urgent = mode === 'countdown' && shown <= 30;
    value.classList.toggle('text-bad', urgent);
    value.classList.toggle('text-strong', !urgent);

    const toggle = qs('[data-timer-toggle]', wrap);
    if (toggle) toggle.textContent = state.running ? 'Pause' : (state.elapsed ? 'Resume' : 'Start');
  }

  function tick() {
    state.elapsed++;
    if (state.settings.timerMode === 'countdown' &&
        state.elapsed >= state.settings.countdownMins * 60) {
      pauseTimer();
      paintTimer();
      markSheet();
      return;
    }
    paintTimer();
  }

  function startTimer() {
    if (state.settings.timerMode === 'off' || state.running) return;
    state.running = true;
    state.ticker = global.setInterval(tick, 1000);
    paintTimer();
  }

  function pauseTimer() {
    state.running = false;
    if (state.ticker) { global.clearInterval(state.ticker); state.ticker = null; }
    paintTimer();
  }

  function resetTimer(autostart) {
    pauseTimer();
    state.elapsed = 0;
    paintTimer();
    if (autostart && state.settings.timerMode !== 'off') startTimer();
  }

  /* =================================================================
     History — recent sheets and today's running stats, kept locally
     ================================================================= */
  const HISTORY_KEY = 'mathit:history';
  const HISTORY_MAX = 12;

  function readHistory() {
    try {
      const raw = global.localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeHistory(arr) {
    try { global.localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX))); }
    catch (e) { /* noop */ }
  }

  function recordResult(correct, total) {
    const entry = {
      seed: state.seed,
      mode: SOURCE,
      year: state.settings.year,
      level: state.settings.level,
      correct: correct,
      total: total,
      pct: total ? Math.round((correct / total) * 100) : 0,
      at: Date.now(),
    };
    const hist = readHistory().filter(function (h) { return h.seed !== entry.seed; });
    hist.unshift(entry);
    writeHistory(hist);
    paintHistory();
  }

  function paintHistory() {
    const list = qs('[data-recent]');
    const hist = readHistory();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todays = hist.filter(function (h) { return h.at >= today.getTime(); });

    const setStat = function (name, text) {
      qsa('[data-stat="' + name + '"]').forEach(function (n) { n.textContent = text; });
    };
    setStat('sheets', String(todays.length));
    if (todays.length) {
      const avg = Math.round(todays.reduce(function (a, h) { return a + h.pct; }, 0) / todays.length);
      const best = todays.reduce(function (a, h) { return Math.max(a, h.pct); }, 0);
      setStat('avg', avg + '%');
      setStat('best', best + '%');
    } else {
      setStat('avg', '–');
      setStat('best', '–');
    }

    if (!list) return;
    if (!hist.length) {
      list.innerHTML = '<li class="text-soft">Nothing marked yet.</li>';
      return;
    }
    list.innerHTML = hist.slice(0, 6).map(function (h) {
      const tone = h.pct >= 85 ? 'text-accent-text' : h.pct >= 60 ? 'text-warn-soft-fg' : 'text-bad';
      const when = new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const isT = h.mode === 'tables';
      const href = isT ? ('tables.html?s=' + h.seed) :
        ('practice.html?year=' + h.year + '&level=' + h.level + '&s=' + h.seed);
      const label = isT ? 'Tables' : ('Y' + h.year + ' ' + S.LEVEL_LABELS[h.level]);
      return '<li class="flex items-baseline justify-between gap-2 border-b border-line py-1 last:border-0">' +
        '<a class="truncate text-soft hover:text-accent-text hover:underline" href="' + href + '">' +
          label + ' <span class="text-faint">#' + h.seed + '</span></a>' +
        '<span class="shrink-0 font-mono text-xs ' + tone + '" title="' + when + '">' +
          h.correct + '/' + h.total + '</span></li>';
    }).join('');
  }

  /* =================================================================
     Printing — worksheet / answer key / both / class set
     ================================================================= */
  function printSheetHtml(seed, sheet, index, total) {
    const s = state.settings;
    const title = isTables
      ? (tablesLabelShort(s.tables) + ' · ' + OPS_LABEL[s.tablesOps])
      : ('Year ' + s.year + ' · ' + S.LEVEL_LABELS[s.level] + ' mental maths');
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const rows = sheet.questions.map(function (q, i) {
      const num = s.showNumbers ? (i + 1) + '.' : '';
      const expr = '<span class="q-expr' + (q.html.indexOf('q-prompt') !== -1 ? ' q-expr--prompt' : '') + '">' + q.html + '</span>';
      const hasBox = q.html.indexOf('data-box') !== -1;
      const box = '<span class="q-input" style="display:inline-block;height:6mm"></span>';
      const eq = (!hasBox && q.equals !== false) ? '<span class="q-eq">=</span>' : '';
      const line = hasBox ? expr.replace(/<span[^>]*\sdata-box[^>]*>[\s\S]*?<\/span>/, box) : (expr + eq + box);
      return '<div class="q-item"><span class="q-num">' + num + '</span><span class="q-body">' + line +
             (q.suffix ? '<span class="text-soft">' + q.suffix + '</span>' : '') + '</span></div>';
    }).join('');

    return '<section class="class-set-sheet">' +
      headHtml({
        title: title,
        sub: 'Math It! · Sheet #' + seed + ' · ' + date +
             (total > 1 ? ' · copy ' + index + ' of ' + total : '') + ' · mathit.co.uk',
        total: sheet.questions.length,
      }) +
      '<div class="q-grid">' + rows + '</div>' +
    '</section>';
  }

  function printKeyHtml(seed, sheet) {
    const s = state.settings;
    return '<section class="class-set-sheet">' +
      '<header class="ws-head ws-head--key">' +
        '<div class="ws-head-id">' +
          '<p class="ws-head-title">Answer key · Sheet #' + seed + '</p>' +
          '<p class="ws-head-sub">' +
          (isTables ? tablesLabelShort(s.tables)
                    : ('Year ' + s.year + ' · ' + S.LEVEL_LABELS[s.level])) +
          ' · ' + sheet.questions.length + ' questions · mathit.co.uk</p>' +
        '</div>' +
      '</header>' +
      '<div class="ak-grid">' + answerKeyHtml(sheet) + '</div>' +
    '</section>';
  }

  /** Build N sheets from sequential seeds so every child gets a different
      paper while the teacher keeps one predictable range of sheet numbers. */
  function buildClassSet() {
    const host = qs('[data-class-set]');
    if (!host) return 0;
    const n = Math.max(2, Math.min(35, Number(state.settings.classSetSize) || 6));
    const withKeys = !!state.settings.classSetKeys;
    const parts = [];

    for (let i = 0; i < n; i++) {
      const seed = (state.seed + i) % 1000000;
      const spec = sheetSpec();
      const sheet = withSeed(seed, function () { return generate(spec); });
      parts.push(printSheetHtml(seed, sheet, i + 1, n));
      if (withKeys) parts.push(printKeyHtml(seed, sheet));
    }
    host.innerHTML = parts.join('');
    return n;
  }

  function doPrint(mode) {
    setRows(state.sheet.questions.length);
    if (mode === 'set') buildClassSet();
    if (global.MathIt.print) global.MathIt.print(mode || 'worksheet');
    else global.print();
  }

  function bootPrintMenu() {
    const wrap = qs('[data-print-menu-wrap]');
    if (!wrap) return;
    const menu = qs('[data-print-menu]', wrap);
    const toggle = qs('[data-print-menu-toggle]', wrap);

    const setOpen = function (open) {
      menu.classList.toggle('hidden', !open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    D.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) setOpen(false);
    });
    D.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setOpen(false);
    });
    qsa('[data-print-mode]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        setOpen(false);
        doPrint(btn.getAttribute('data-print-mode'));
      });
    });
  }

  /* =================================================================
     Settings drawer
     ================================================================= */
  function buildTopicList() {
    const host = qs('[data-topic-list]');
    if (!host || isTables) return;
    const groups = G.groupedTopicsForYear(state.settings.year);
    const active = new Set(activeTopicIds());

    host.innerHTML = groups.map(function (g) {
      return '<fieldset class="rounded-lg border border-line bg-raise p-4">' +
        '<legend class="px-1 text-xs font-bold uppercase tracking-wider text-accent-text">' + g.group + '</legend>' +
        '<div class="mt-2 grid gap-2 sm:grid-cols-2">' +
          g.topics.map(function (t) {
            return '<label class="opt" title="' + t.blurb.replace(/"/g, '&quot;') + '">' +
              '<input type="checkbox" data-topic="' + t.id + '"' + (active.has(t.id) ? ' checked' : '') + '>' +
              '<span><span class="font-medium text-strong">' + t.label + '</span>' +
              '<span class="mt-0.5 block text-xs leading-snug text-soft">' + t.blurb + '</span></span>' +
            '</label>';
          }).join('') +
        '</div>' +
      '</fieldset>';
    }).join('');

    qsa('[data-topic]', host).forEach(function (cb) {
      cb.addEventListener('change', function () {
        const chosen = qsa('[data-topic]:checked', host).map((x) => x.getAttribute('data-topic'));
        if (!chosen.length) { cb.checked = true; return; }   // never allow an empty sheet
        const all = G.topicsForYear(state.settings.year).map((t) => t.id);
        state.settings.topics = chosen.length === all.length ? null : chosen;
        persist();
        paintMeta();
      });
    });
  }

  /* =================================================================
     Times-tables picker: a 1–100 grid plus presets
     ================================================================= */
  const TABLE_PRESETS = {
    '1-12': [1,2,3,4,5,6,7,8,9,10,11,12],
    'easy': [1, 2, 5, 10],
    'tricky': [6, 7, 8, 9, 12],
    '1-20': Array.from({ length: 20 }, (_, i) => i + 1),
    'all': Array.from({ length: 100 }, (_, i) => i + 1),
  };

  function buildTablesPicker() {
    const host = qs('[data-tables-grid]');
    if (!host) return;

    host.innerHTML = Array.from({ length: 100 }, function (_, i) {
      const n = i + 1;
      return '<button type="button" class="table-chip" data-table="' + n + '" aria-pressed="false">' + n + '</button>';
    }).join('');

    const paint = function () {
      const on = new Set(state.settings.tables);
      qsa('[data-table]', host).forEach(function (b) {
        b.setAttribute('aria-pressed', String(on.has(Number(b.getAttribute('data-table')))));
      });
      qsa('[data-tables-preset]').forEach(function (b) {
        const want = TABLE_PRESETS[b.getAttribute('data-tables-preset')] || [];
        b.setAttribute('aria-pressed', String(
          want.length === state.settings.tables.length &&
          want.every(function (n) { return on.has(n); })));
      });
      paintMeta();
    };

    const setTables = function (list) {
      const next = Array.from(new Set(list.map(Number).filter(function (n) { return n >= 1 && n <= 100; })))
        .sort(function (a, b) { return a - b; });
      if (!next.length) return;                    // never allow an empty sheet
      state.settings.tables = next;
      persist();
      buildSheet(state.seed);
      paint();
    };

    qsa('[data-table]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        const n = Number(b.getAttribute('data-table'));
        const cur = state.settings.tables.slice();
        const at = cur.indexOf(n);
        if (at === -1) cur.push(n); else cur.splice(at, 1);
        setTables(cur.length ? cur : [n]);
      });
    });

    qsa('[data-tables-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTables((TABLE_PRESETS[b.getAttribute('data-tables-preset')] || []).slice());
      });
    });

    const applyRange = qs('[data-tables-range-apply]');
    if (applyRange) applyRange.addEventListener('click', function () {
      const from = Number((qs('[data-tables-range-from]') || {}).value || 1);
      const to = Number((qs('[data-tables-range-to]') || {}).value || 12);
      const lo = Math.max(1, Math.min(100, Math.min(from, to)));
      const hi = Math.max(1, Math.min(100, Math.max(from, to)));
      const out = [];
      for (let n = lo; n <= hi; n++) out.push(n);
      setTables(out);
    });

    paint();
  }

  function persist() {
    state.settings = S.sanitise(state.settings);
    S.save(state.settings);
    S.applyModes(state.settings);
  }

  function bootDrawer() {
    const drawer = qs('[data-drawer]');
    const toggle = qs('[data-drawer-toggle]');
    if (drawer && toggle) {
      const setOpen = function (open) {
        drawer.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', String(open));
        const chev = qs('[data-drawer-chevron]', toggle);
        if (chev) chev.classList.toggle('rotate-180', open);
        if (open) drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      toggle.addEventListener('click', function () {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });
      const close = qs('[data-drawer-close]', drawer);
      if (close) close.addEventListener('click', function () { setOpen(false); toggle.focus(); });
    }

    /* --- select / radio / checkbox bindings --- */
    qsa('[data-setting]').forEach(function (ctrl) {
      const key = ctrl.getAttribute('data-setting');
      const kind = ctrl.type === 'checkbox' ? 'bool' : 'value';

      if (kind === 'bool') ctrl.checked = !!state.settings[key];
      else ctrl.value = String(state.settings[key]);

      ctrl.addEventListener('change', function () {
        const raw = kind === 'bool' ? ctrl.checked : ctrl.value;
        state.settings[key] = (kind === 'bool') ? raw
          : (/^\d+$/.test(raw) ? Number(raw) : raw);
        persist();

        if (key === 'year') { state.settings.topics = null; buildTopicList(); buildSheet(state.seed); }
        else if (key === 'level' || key === 'count') buildSheet(state.seed);
        else if (/^tables/.test(key)) buildSheet(state.seed);
        else if (key === 'showNumbers' || key === 'hideTopicTags') render();
        else if (key === 'timerMode' || key === 'countdownMins') resetTimer(true);

        paintMeta();
        syncDrawerControls();
        if (global.MathIt.syncModeControls) global.MathIt.syncModeControls();
      });
    });

    /* --- bulk topic buttons --- */
    const all = qs('[data-topics-all]');
    if (all) all.addEventListener('click', function () {
      state.settings.topics = null;
      persist(); buildTopicList(); paintMeta();
    });
    const none = qs('[data-topics-core]');
    if (none) none.addEventListener('click', function () {
      const core = G.topicsForYear(state.settings.year)
        .filter((t) => t.group === 'Mental arithmetic' || t.group === 'Written methods')
        .map((t) => t.id);
      state.settings.topics = core;
      persist(); buildTopicList(); paintMeta();
    });

    /* --- share link --- */
    const copy = qs('[data-copy-link]');
    if (copy) copy.addEventListener('click', function () {
      const field = qs('[data-share-url]');
      if (!field) return;
      field.select();
      const done = function () {
        copy.textContent = 'Copied';
        global.setTimeout(function () { copy.textContent = 'Copy'; }, 1800);
      };
      if (global.navigator.clipboard) {
        global.navigator.clipboard.writeText(field.value).then(done, done);
      } else {
        try { D.execCommand('copy'); } catch (e) { /* noop */ }
        done();
      }
    });

    /* --- timer controls --- */
    const tToggle = qs('[data-timer-toggle]');
    if (tToggle) tToggle.addEventListener('click', function () {
      state.running ? pauseTimer() : startTimer();
    });
    const tReset = qs('[data-timer-reset]');
    if (tReset) tReset.addEventListener('click', function () { resetTimer(false); });

    /* --- clear the local history --- */
    const clearBtn = qs('[data-clear-history]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      try { global.localStorage.removeItem(HISTORY_KEY); } catch (e) { /* noop */ }
      paintHistory();
    });
  }

  function syncDrawerControls() {
    qsa('[data-setting]').forEach(function (ctrl) {
      const key = ctrl.getAttribute('data-setting');
      if (ctrl.type === 'checkbox') ctrl.checked = !!state.settings[key];
      else if (ctrl.value !== String(state.settings[key])) ctrl.value = String(state.settings[key]);
    });
    const cd = qs('[data-countdown-row]');
    if (cd) cd.classList.toggle('hidden', state.settings.timerMode !== 'countdown');
    paintTimer();
  }

  /* =================================================================
     Wiring
     ================================================================= */
  function bindActions(root) {
    qsa('[data-action]', root).forEach(function (btn) {
      if (btn.getAttribute('data-bound') === '1') return;
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function () {
        switch (btn.getAttribute('data-action')) {
          case 'new': newSheet(); break;
          case 'reset': resetSheet(); break;
          case 'mark': markSheet(); break;
          case 'answers': toggleAnswers(); break;
          case 'print': doPrint('worksheet'); break;
        }
      });
    });
  }

  function bindShortcuts() {
    D.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (D.activeElement && D.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const map = {
        n: newSheet, r: resetSheet, m: markSheet, a: toggleAnswers,
        p: function () { doPrint('worksheet'); },
      };
      const fn = map[ev.key.toLowerCase()];
      if (fn) { ev.preventDefault(); fn(); }
    });
  }

  function boot() {
    if (!qs('[data-sheet]')) return;

    S.applyModes(state.settings);
    bootDrawer();
    buildTopicList();
    buildTablesPicker();
    syncDrawerControls();
    bindActions(D);
    bindShortcuts();
    bootPrintMenu();
    paintHistory();
    buildSheet(state.seed);

    if (state.settings.timerMode === 'stopwatch') {
      // start the stopwatch the moment the learner engages with the sheet
      const once = function () { startTimer(); D.removeEventListener('focusin', once); };
      D.addEventListener('focusin', once);
    } else if (state.settings.timerMode === 'countdown') {
      startTimer();
    }
    paintTimer();

    global.addEventListener('beforeprint', function () {
      setRows(state.sheet.questions.length);
    });

    /* The header theme button and the footer controls write to the same
       store. Copy back only the presentation keys — never the sheet recipe,
       which this page owns and has already written to the URL. */
    D.addEventListener('mathit:modes', function (ev) {
      const live = (ev.detail && ev.detail.settings) || S.load();
      ['theme', 'contrast', 'compact', 'showKey', 'fontScale'].forEach(function (k) {
        state.settings[k] = live[k];
      });
      syncDrawerControls();
    });
  }

  /* A small public handle so the sheet can be driven from the console,
     from automated tests, or from a future classroom-dashboard script. */
  global.MathIt.Practice = {
    state: state,
    newSheet: newSheet,
    resetSheet: resetSheet,
    markSheet: markSheet,
    toggleAnswers: toggleAnswers,
    rebuild: function (seed) { buildSheet(seed); },
    getSheet: function () { return state.sheet; },
    print: doPrint,
    buildClassSet: buildClassSet,
    history: readHistory,
  };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
