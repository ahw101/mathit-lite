/* =====================================================================
   MATH IT!  —  Settings store
   ---------------------------------------------------------------------
   One source of truth for worksheet configuration. Settings travel in
   three places and stay in sync:

     1. localStorage  ("mathit:settings")  — remembered between visits
     2. the URL        (?year=5&level=hard&config=…) — shareable links
     3. the live DOM   (html class names drive compact / contrast modes)

   The `config` parameter is a URL-safe base64 encoding of the non-trivial
   options so that a teacher can bookmark or email an exact worksheet
   recipe without an enormous query string.

   Exposed as  window.MathIt.Settings
   ===================================================================== */
(function (global) {
  'use strict';

  const KEY = 'mathit:settings';

  const DEFAULTS = {
    year: 5,
    level: 'medium',
    count: 36,
    topics: null,          // null = "every topic available to this year"
    theme: 'auto',         // auto | light | dark
    compact: false,
    contrast: false,
    fontScale: 'normal',   // normal | large | xlarge
    timerMode: 'off',      // off | stopwatch | countdown
    countdownMins: 5,
    showNumbers: true,
    autoAdvance: true,     // Enter jumps to the next box
    hideTopicTags: true,
    showKey: false,        // on-screen answer key
    classSetSize: 6,       // sheets produced by "print a class set"
    classSetKeys: false,   // include an answer key after each one

    /* --- times tables (tables.html) --- */
    tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    tablesOps: 'mul',      // mul | div | both | missing | all
    tablesMin: 1,
    tablesMax: 12,
    tablesOrder: false,    // true = walk the tables in order, not shuffled
  };

  const LEVELS = ['easy', 'medium', 'hard'];
  const YEARS = [2, 3, 4, 5, 6];

  const LEVEL_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const LEVEL_BLURB = {
    easy: 'Confidence building — smaller numbers and single-step calculations.',
    medium: 'Expected standard — the everyday fluency work for the year group.',
    hard: 'Greater depth — multi-step reasoning and larger, trickier numbers.',
  };

  /* ---------------- encoding helpers ---------------- */

  function b64urlEncode(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return ''; }
  }

  function b64urlDecode(str) {
    try {
      const pad = str.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(pad + '==='.slice((pad.length + 3) % 4))));
    } catch (e) { return ''; }
  }

  /** Only serialise what differs from the defaults — short, legible links. */
  function encodeConfig(s) {
    const diff = {};
    Object.keys(DEFAULTS).forEach((k) => {
      if (k === 'year' || k === 'level') return;      // these ride as plain params
      const a = JSON.stringify(s[k]);
      const b = JSON.stringify(DEFAULTS[k]);
      if (a !== b) diff[k] = s[k];
    });
    if (!Object.keys(diff).length) return '';
    return b64urlEncode(JSON.stringify(diff));
  }

  function decodeConfig(raw) {
    if (!raw) return {};
    const json = b64urlDecode(raw);
    if (!json) return {};
    try {
      const obj = JSON.parse(json);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  /* ---------------- validation ---------------- */

  function sanitise(input) {
    const s = Object.assign({}, DEFAULTS, input || {});
    s.year = YEARS.indexOf(Number(s.year)) !== -1 ? Number(s.year) : DEFAULTS.year;
    s.level = LEVELS.indexOf(s.level) !== -1 ? s.level : DEFAULTS.level;
    s.count = [12, 18, 24, 36, 48, 60].indexOf(Number(s.count)) !== -1 ? Number(s.count) : 36;
    s.fontScale = ['normal', 'large', 'xlarge'].indexOf(s.fontScale) !== -1 ? s.fontScale : 'normal';
    s.theme = ['auto', 'light', 'dark'].indexOf(s.theme) !== -1 ? s.theme : 'auto';
    s.showKey = !!s.showKey;
    s.classSetKeys = !!s.classSetKeys;
    s.classSetSize = Math.max(2, Math.min(35, Number(s.classSetSize) || 6));

    s.tablesOps = ['mul', 'div', 'both', 'missing', 'all'].indexOf(s.tablesOps) !== -1 ? s.tablesOps : 'mul';
    s.tablesMin = Math.max(0, Math.min(100, Math.round(Number(s.tablesMin)) || 0));
    s.tablesMax = Math.max(0, Math.min(100, Math.round(Number(s.tablesMax)) || 0));
    if (s.tablesMax < s.tablesMin) { const t = s.tablesMin; s.tablesMin = s.tablesMax; s.tablesMax = t; }
    if (s.tablesMax === 0) s.tablesMax = 12;
    s.tablesOrder = !!s.tablesOrder;
    if (Array.isArray(s.tables)) {
      s.tables = Array.from(new Set(s.tables.map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100))).sort((a, b) => a - b);
    }
    if (!Array.isArray(s.tables) || !s.tables.length) s.tables = DEFAULTS.tables.slice();
    s.timerMode = ['off', 'stopwatch', 'countdown'].indexOf(s.timerMode) !== -1 ? s.timerMode : 'off';
    s.countdownMins = Math.max(1, Math.min(60, Number(s.countdownMins) || 5));
    s.compact = !!s.compact;
    s.contrast = !!s.contrast;
    s.showNumbers = !!s.showNumbers;
    s.autoAdvance = !!s.autoAdvance;
    s.hideTopicTags = !!s.hideTopicTags;
    if (Array.isArray(s.topics)) {
      s.topics = s.topics.filter((t) => typeof t === 'string');
      if (!s.topics.length) s.topics = null;
    } else {
      s.topics = null;
    }
    return s;
  }

  /* ---------------- persistence ---------------- */

  function readStore() {
    try {
      const raw = global.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function save(s) {
    try { global.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    return s;
  }

  function clear() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* noop */ }
  }

  /**
   * Resolution order (lowest → highest priority):
   *   defaults → localStorage → ?config= → explicit ?year= / ?level= / ?count=
   */
  function load(search) {
    const params = new URLSearchParams(search !== undefined ? search : global.location.search);
    let s = Object.assign({}, DEFAULTS, readStore());

    if (params.has('config')) s = Object.assign(s, decodeConfig(params.get('config')));
    if (params.has('year')) s.year = Number(params.get('year'));
    if (params.has('level')) s.level = String(params.get('level')).toLowerCase();
    if (params.has('count')) s.count = Number(params.get('count'));
    if (params.has('topics')) {
      const t = String(params.get('topics')).split(',').map((x) => x.trim()).filter(Boolean);
      if (t.length) s.topics = t;
    }
    if (params.has('tables')) {
      const t = String(params.get('tables')).split(',').map(Number).filter((n) => n >= 1 && n <= 100);
      if (t.length) s.tables = t;
    }
    if (params.has('ops')) s.tablesOps = String(params.get('ops'));
    if (params.has('compact')) s.compact = params.get('compact') === '1';
    if (params.has('contrast')) s.contrast = params.get('contrast') === '1';

    return sanitise(s);
  }

  /* ---------------- URL building ---------------- */

  function toQuery(s) {
    const q = new URLSearchParams();
    q.set('year', String(s.year));
    q.set('level', s.level);
    const cfg = encodeConfig(sanitise(s));
    if (cfg) q.set('config', cfg);
    return q.toString();
  }

  function practiceUrl(s, base) {
    return (base || 'practice.html') + '?' + toQuery(sanitise(s));
  }

  /** Short, human-readable link for a times-tables sheet. */
  function tablesUrl(s, seed) {
    const t = sanitise(s);
    const q = new URLSearchParams();
    q.set('tables', t.tables.join(','));
    q.set('ops', t.tablesOps);
    if (t.count !== DEFAULTS.count) q.set('count', String(t.count));
    if (seed) q.set('s', String(seed));
    return 'tables.html?' + q.toString();
  }

  /* ---------------- theme ---------------- */

  function prefersDark() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  }

  /** Resolve 'auto' against the operating-system preference. */
  function resolveTheme(theme) {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    return prefersDark() ? 'dark' : 'light';
  }

  /* ---------------- document-level modes ---------------- */

  function applyModes(s) {
    const doc = global.document;
    const root = doc.documentElement;
    const dark = resolveTheme(s.theme) === 'dark';

    root.classList.toggle('mi-dark', dark);
    root.classList.toggle('mi-compact', !!s.compact);
    root.classList.toggle('mi-contrast', !!s.contrast);
    root.classList.toggle('mi-show-key', !!s.showKey);
    root.classList.remove('mi-font-lg', 'mi-font-xl');
    if (s.fontScale === 'large') root.classList.add('mi-font-lg');
    if (s.fontScale === 'xlarge') root.classList.add('mi-font-xl');

    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121110' : '#faf9f7');

    try {
      doc.dispatchEvent(new CustomEvent('mathit:modes', { detail: { settings: s, dark: dark } }));
    } catch (e) { /* older browsers */ }
  }

  /** Patch a few keys, persist, re-apply document modes. Returns the new settings. */
  function update(patch) {
    const next = sanitise(Object.assign({}, load(), patch || {}));
    save(next);
    applyModes(next);
    return next;
  }

  global.MathIt = global.MathIt || {};
  global.MathIt.Settings = {
    KEY, DEFAULTS, LEVELS, YEARS, LEVEL_LABELS, LEVEL_BLURB,
    load, save, clear, sanitise, toQuery, practiceUrl, tablesUrl, update,
    encodeConfig, decodeConfig, applyModes, resolveTheme, prefersDark,
  };
})(window);
