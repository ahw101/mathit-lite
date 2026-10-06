/* Math It! Lite — the whole UI, in one file.
   Needs generator.js loaded first. */
(function () {
  'use strict';

  var G = window.MathIt && window.MathIt.Generator;
  var MODE = document.body.getAttribute('data-mode') || '';
  var KEY = 'mathit-lite';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------- theme */
  function applyTheme(t) {
    var dark = t === 'dark' || (t === 'auto' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    $$('[data-theme-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-btn') === t));
    });
  }
  function initTheme() {
    var t = localStorage.getItem(KEY + ':theme') || 'auto';
    applyTheme(t);
    $$('[data-theme-btn]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-theme-btn');
        localStorage.setItem(KEY + ':theme', v);
        applyTheme(v);
      });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if ((localStorage.getItem(KEY + ':theme') || 'auto') === 'auto') applyTheme('auto');
    });
  }

  /* ---------------------------------------------------------- settings */
  var defaults = {
    year: 5, level: 'medium', count: 36,
    tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ops: 'mul', max: 12, tcount: 36
  };
  var S = Object.assign({}, defaults);

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY + ':' + MODE) || '{}');
      Object.keys(defaults).forEach(function (k) {
        if (raw[k] !== undefined && raw[k] !== null) S[k] = raw[k];
      });
    } catch (e) { /* first visit */ }

    var q = new URLSearchParams(location.search);
    if (q.has('year'))   S.year = Number(q.get('year'));
    if (q.has('level'))  S.level = q.get('level');
    if (q.has('count'))  { S.count = Number(q.get('count')); S.tcount = Number(q.get('count')); }
    if (q.has('ops'))    S.ops = q.get('ops');
    if (q.has('max'))    S.max = Number(q.get('max'));
    if (q.has('tables')) {
      var t = q.get('tables').split(',').map(Number).filter(function (n) { return n >= 1 && n <= 20; });
      if (t.length) S.tables = t;
    }
    if (!Array.isArray(S.tables) || !S.tables.length) S.tables = defaults.tables.slice();
  }
  function save() { localStorage.setItem(KEY + ':' + MODE, JSON.stringify(S)); }

  /* ---------------------------------------------------------- sheet */
  var sheet = null;

  function build() {
    if (MODE === 'tables') {
      sheet = G.buildTablesSheet({
        tables: S.tables, ops: S.ops, min: 1, max: S.max, count: clampCount(S.tcount)
      });
    } else {
      sheet = G.buildSheet({ year: S.year, level: S.level, count: clampCount(S.count) });
    }
    render();
  }

  function clampCount(n) {
    n = Math.round(Number(n) || 36);
    return Math.max(1, Math.min(500, n));
  }

  function render() {
    var grid = $('[data-sheet]');
    grid.innerHTML = sheet.questions.map(function (q, i) {
      var expr = '<span class="q-expr' + (q.wide ? ' q-expr--prompt' : '') + '">' + q.html + '</span>';
      return '<div class="q-item" data-q="' + i + '">' +
        '<span class="q-num">' + (i + 1) + '</span>' +
        '<span class="q-body">' + expr +
          (q.equals ? '<span class="q-eq">=</span>' : '') +
          '<input class="q-input" type="text" inputmode="text" autocomplete="off" ' +
            'spellcheck="false" aria-label="Answer to question ' + (i + 1) + '">' +
          '<span class="q-solution">' + q.ansHtml + '</span>' +
          '<span class="q-mark" aria-hidden="true"></span>' +
        '</span></div>';
    }).join('');

    var n = sheet.questions.length;
    grid.style.setProperty('--rows', Math.ceil(n / (n > 60 ? 3 : 2)));
    grid.style.setProperty('--cols', n > 60 ? 3 : 2);
    setPrintLayout(n);
    setHeader(n);
    say('');
    document.documentElement.classList.remove('print-answers');
    $$('[data-sheet] .q-item').forEach(function (el) { el.classList.remove('is-revealed'); });
    var pg = $('[data-pages]');
    if (pg) pg.textContent = pageEstimate(n);
  }

  /* columns and density are chosen so a sheet fills the page without
     spilling onto a second one until it genuinely has to. */
  function printPlan(n) {
    var cols = n <= 40 ? 2 : n <= 90 ? 3 : 4;
    var rows = Math.ceil(n / cols);
    var density = rows <= 18 ? 'normal' : rows <= 24 ? 'snug' : rows <= 32 ? 'tight' : 'tighter';
    var mm = { normal: 8.4, snug: 7.4, tight: 6.4, tighter: 5.2 }[density];
    return { cols: cols, rows: rows, density: density, pages: Math.max(1, Math.ceil(rows * mm / 258)) };
  }
  function setPrintLayout(n) {
    var p = printPlan(n);
    var r = document.documentElement;
    r.style.setProperty('--print-cols', p.cols);
    r.style.setProperty('--print-rows', p.rows);
    r.setAttribute('data-density', p.density);
  }
  function pageEstimate(n) {
    var p = printPlan(n);
    return p.pages === 1 ? 'Prints on one page' : 'Prints on ' + p.pages + ' pages';
  }

  function setHeader(n) {
    var title = MODE === 'tables' ? tablesTitle() : yearTitle();
    var t = $('[data-head-title]'); if (t) t.textContent = title;
    var s = $('[data-head-sub]');
    if (s) {
      s.textContent = 'Math It! · ' + new Date().toLocaleDateString('en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' });
    }
    var c = $('[data-head-count]'); if (c) c.textContent = '/ ' + n;
    var l = $('[data-sheet-label]'); if (l) l.textContent = title;
  }

  function yearTitle() {
    var lv = { easy: 'Easier', medium: 'Medium', hard: 'Harder' }[S.level] || 'Medium';
    return 'Year ' + S.year + ' · ' + lv;
  }
  function tablesTitle() {
    var t = S.tables.slice().sort(function (a, b) { return a - b; });
    var run = t.length > 2 && t[t.length - 1] - t[0] === t.length - 1;
    var names = run ? t[0] + '–' + t[t.length - 1] : t.join(', ');
    var op = { mul: '×', div: '÷', both: '× and ÷', missing: 'missing numbers' }[S.ops] || '×';
    return names + ' times tables · ' + op;
  }

  /* ---------------------------------------------------------- marking */
  function mark() {
    if (!sheet) return;
    var right = 0;
    sheet.questions.forEach(function (q, i) {
      var item = $('[data-q="' + i + '"]');
      var input = $('.q-input', item);
      var badge = $('.q-mark', item);
      var raw = (input.value || '').trim();
      input.classList.remove('is-correct', 'is-incorrect');
      badge.classList.remove('is-correct', 'is-incorrect');
      badge.textContent = '';
      if (!raw) return;
      var ok = G.isCorrect(q, raw);
      input.classList.add(ok ? 'is-correct' : 'is-incorrect');
      badge.classList.add(ok ? 'is-correct' : 'is-incorrect');
      badge.textContent = ok ? '✓' : '✕';
      if (ok) right++; else item.classList.add('is-revealed');
    });
    var n = sheet.questions.length;
    var pc = Math.round((right / n) * 100);
    say(right + ' out of ' + n + '. ' + verdict(pc, n - right), pc);
  }

  function verdict(pc, wrong) {
    if (pc === 100) return 'Every single one.';
    if (pc >= 90) return 'So close.';
    if (pc >= 75) return 'Good going.';
    if (pc >= 50) return wrong === 1 ? 'One to look at again.' : 'Halfway there.';
    return 'Worth another go.';
  }

  function say(msg, pc) {
    var el = $('[data-score]');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('opacity-0', !msg);
    el.className = el.className.replace(/\bbg-\S+|\btext-\S+-fg\b/g, '');
    if (!msg) return;
    var tone = pc === undefined ? '' :
      pc >= 75 ? ' bg-accent-soft text-accent-soft-fg' :
      pc >= 50 ? ' bg-warn-soft text-warn-soft-fg' : ' bg-bad-soft text-bad-soft-fg';
    el.className = 'rounded-lg px-3 py-2 text-sm font-semibold' + tone;
  }

  function reveal() {
    var items = $$('[data-sheet] .q-item');
    var on = !items.length || !items[0].classList.contains('is-revealed');
    items.forEach(function (el) { el.classList.toggle('is-revealed', on); });
    var b = $('[data-act="answers"]');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Hide answers' : 'Answers'; }
  }

  function reset() {
    $$('[data-sheet] .q-input').forEach(function (i) {
      i.value = ''; i.classList.remove('is-correct', 'is-incorrect');
    });
    $$('[data-sheet] .q-mark').forEach(function (m) {
      m.textContent = ''; m.classList.remove('is-correct', 'is-incorrect');
    });
    $$('[data-sheet] .q-item').forEach(function (el) { el.classList.remove('is-revealed'); });
    say('');
  }

  function print(withAnswers) {
    document.documentElement.classList.toggle('print-answers', !!withAnswers);
    window.print();
  }
  window.addEventListener('afterprint', function () {
    document.documentElement.classList.remove('print-answers');
  });

  /* ---------------------------------------------------------- controls */
  function wire() {
    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'new') { build(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        if (a === 'mark') mark();
        if (a === 'answers') reveal();
        if (a === 'reset') reset();
        if (a === 'print') print(false);
        if (a === 'print-answers') print(true);
      });
    });

    $$('[data-set]').forEach(function (el) {
      var k = el.getAttribute('data-set');
      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          S[k] = isNaN(Number(el.value)) ? el.value : Number(el.value);
          syncControls(); save(); build();
        });
      } else {
        el.addEventListener('change', function () {
          S[k] = el.type === 'number' ? clampCount(el.value) : el.value;
          if (el.type === 'number') el.value = S[k];
          syncControls(); save(); build();
        });
      }
    });

    $$('[data-table]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.getAttribute('data-table'));
        var i = S.tables.indexOf(n);
        if (i === -1) S.tables.push(n); else S.tables.splice(i, 1);
        if (!S.tables.length) S.tables = [n];
        syncControls(); save(); build();
      });
    });

    $$('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-preset');
        if (p === 'all') S.tables = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        if (p === 'tricky') S.tables = [6, 7, 8, 9, 12];
        if (p === 'easy') S.tables = [2, 5, 10];
        syncControls(); save(); build();
      });
    });

    $$('[data-count-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = clampCount(b.getAttribute('data-count-preset'));
        if (MODE === 'tables') S.tcount = v; else S.count = v;
        syncControls(); save(); build();
      });
    });

    // Enter moves to the next box; Enter on the last one marks the sheet.
    $('[data-sheet]').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var inputs = $$('[data-sheet] .q-input');
      var i = inputs.indexOf(e.target);
      if (i > -1 && i < inputs.length - 1) inputs[i + 1].focus(); else mark();
    });

    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      var k = e.key.toLowerCase();
      if (k === 'n') build();
      if (k === 'm') mark();
      if (k === 'a') reveal();
      if (k === 'p') { e.preventDefault(); print(false); }
    });
  }

  function syncControls() {
    $$('[data-set]').forEach(function (el) {
      var k = el.getAttribute('data-set');
      var v = S[k];
      if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(String(el.value) === String(v)));
      else el.value = v;
    });
    $$('[data-table]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(S.tables.indexOf(Number(b.getAttribute('data-table'))) !== -1));
    });
    var pool = $('[data-pool]');
    if (pool && MODE === 'tables') {
      var shapes = S.ops === 'all' ? 3 : S.ops === 'both' ? 2 : 1;
      var facts = S.tables.length * S.max * shapes;
      var asked = clampCount(S.tcount);
      pool.textContent = asked > facts
        ? facts + ' different facts available, so some will come round again.'
        : facts + ' different facts to draw from.';
    }
  }

  /* ---------------------------------------------------------- home */
  function wireHome() {
    $$('[data-go]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        location.href = el.getAttribute('data-go');
      });
    });
  }

  /* ---------------------------------------------------------- go */
  initTheme();
  if (!MODE) { wireHome(); return; }
  if (!G) return;
  load();
  syncControls();
  wire();
  build();

  window.MathItLite = { get sheet() { return sheet; }, build: build, mark: mark, settings: S, printPlan: printPlan };
})();
