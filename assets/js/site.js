/* =====================================================================
   MATH IT!  —  Shared site behaviour
   ---------------------------------------------------------------------
   Runs on every page: navigation, accessibility modes, the home-page
   worksheet picker, FAQ accordions and the contact form.
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.document;
  const S = global.MathIt && global.MathIt.Settings;
  const qs = (sel, root) => (root || D).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || D).querySelectorAll(sel));

  /* ---------------- 1. Theme + accessibility modes ---------------- */
  function syncModeControls() {
    if (!S) return;
    const s = S.load();
    const dark = S.resolveTheme(s.theme) === 'dark';

    qsa('[data-mode-toggle]').forEach(function (btn) {
      const key = btn.getAttribute('data-mode-toggle');
      const on = !!s[key];
      btn.setAttribute('aria-checked', String(on));
      btn.setAttribute('aria-pressed', String(on));
    });

    qsa('[data-theme-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-set') === s.theme));
    });

    qsa('[data-theme-toggle]').forEach(function (btn) {
      const sun = qs('[data-theme-icon="light"]', btn);
      const moon = qs('[data-theme-icon="dark"]', btn);
      if (sun) sun.classList.toggle('hidden', dark);
      if (moon) moon.classList.toggle('hidden', !dark);
      btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    });

    qsa('[data-theme-label]').forEach(function (n) {
      n.textContent = s.theme === 'auto'
        ? 'Auto (' + (dark ? 'dark' : 'light') + ')'
        : (s.theme === 'dark' ? 'Dark' : 'Light');
    });
  }

  function bootModes() {
    if (!S) return;
    S.applyModes(S.load());
    syncModeControls();

    qsa('[data-mode-toggle]').forEach(function (btn) {
      const key = btn.getAttribute('data-mode-toggle');
      btn.addEventListener('click', function () {
        const patch = {};
        patch[key] = !S.load()[key];
        S.update(patch);
        syncModeControls();
      });
    });

    /* Header button: flip whatever is on screen right now to its opposite. */
    qsa('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const nowDark = S.resolveTheme(S.load().theme) === 'dark';
        S.update({ theme: nowDark ? 'light' : 'dark' });
        syncModeControls();
      });
    });

    /* Explicit Auto / Light / Dark segmented control. */
    qsa('[data-theme-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.update({ theme: btn.getAttribute('data-theme-set') });
        syncModeControls();
      });
    });

    /* Follow the OS while the user is on "auto". */
    try {
      const mq = global.matchMedia('(prefers-color-scheme: dark)');
      const onChange = function () {
        if (S.load().theme === 'auto') { S.applyModes(S.load()); syncModeControls(); }
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) { /* noop */ }

    /* Keep tabs in step. */
    global.addEventListener('storage', function (ev) {
      if (ev.key === S.KEY) { S.applyModes(S.load()); syncModeControls(); }
    });
  }

  /* ---------------- 2. Mobile navigation ---------------- */
  function bootNav() {
    const btn = qs('[data-nav-toggle]');
    const panel = qs('[data-nav-panel]');
    if (!btn || !panel) return;

    function setOpen(open) {
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('hidden', !open);
      qs('[data-icon-open]', btn).classList.toggle('hidden', open);
      qs('[data-icon-close]', btn).classList.toggle('hidden', !open);
    }
    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
    qsa('a', panel).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    global.addEventListener('resize', function () {
      if (global.innerWidth >= 768) setOpen(false);
    });
  }

  /* ---------------- 3. Home-page worksheet picker ---------------- */
  function bootPicker() {
    const picker = qs('[data-picker]');
    if (!picker || !S) return;

    const state = S.load();
    const out = qs('[data-picker-link]', picker);
    const summary = qs('[data-picker-summary]', picker);
    const blurb = qs('[data-picker-blurb]', picker);

    function paint() {
      qsa('[data-year-btn]', picker).forEach(function (b) {
        const on = Number(b.getAttribute('data-year-btn')) === state.year;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('border-accent', on);
        b.classList.toggle('bg-accent-soft', on);
        b.classList.toggle('ring-1', on);
        b.classList.toggle('ring-accent', on);
      });
      qsa('[data-level-btn]', picker).forEach(function (b) {
        const on = b.getAttribute('data-level-btn') === state.level;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('border-accent', on);
        b.classList.toggle('bg-accent', on);
        b.classList.toggle('text-accent-fg', on);
        b.classList.toggle('bg-surface', !on);
        b.classList.toggle('text-body', !on);
      });
      if (out) out.href = S.practiceUrl(state);
      if (summary) summary.textContent = 'Year ' + state.year + ' · ' + S.LEVEL_LABELS[state.level] + ' · ' + state.count + ' questions';
      if (blurb) blurb.textContent = S.LEVEL_BLURB[state.level];
    }

    qsa('[data-year-btn]', picker).forEach(function (b) {
      b.addEventListener('click', function () {
        state.year = Number(b.getAttribute('data-year-btn'));
        S.save(S.sanitise(state));
        paint();
      });
    });
    qsa('[data-level-btn]', picker).forEach(function (b) {
      b.addEventListener('click', function () {
        state.level = b.getAttribute('data-level-btn');
        S.save(S.sanitise(state));
        paint();
      });
    });
    paint();
  }

  /* ---------------- 4. FAQ / disclosure accordions ---------------- */
  function bootAccordions() {
    qsa('[data-accordion] > details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        qsa('[data-accordion] > details').forEach(function (other) {
          if (other !== d && other.hasAttribute('data-exclusive')) other.open = false;
        });
      });
    });
  }

  /* ---------------- 5. Contact form (no server required) ---------------- */
  function bootContact() {
    const form = qs('[data-contact-form]');
    if (!form) return;
    const status = qs('[data-contact-status]', form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const subject = String(data.get('subject') || 'Website enquiry').trim();
      const message = String(data.get('message') || '').trim();

      if (!name || !email || !message) {
        status.textContent = 'Please complete your name, email address and message.';
        status.className = 'mt-4 rounded-lg border border-bad-line bg-bad-soft px-4 py-3 text-sm text-bad-soft-fg';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = 'That email address does not look right — please check it.';
        status.className = 'mt-4 rounded-lg border border-bad-line bg-bad-soft px-4 py-3 text-sm text-bad-soft-fg';
        return;
      }

      const to = form.getAttribute('data-mailto') || 'hello@example.com';
      const body = 'Name: ' + name + '\nEmail: ' + email + '\n\n' + message;
      const href = 'mailto:' + to + '?subject=' + encodeURIComponent('[Math It!] ' + subject) +
        '&body=' + encodeURIComponent(body);

      status.textContent = 'Opening your email client… if nothing happens, write to ' + to + ' directly.';
      status.className = 'mt-4 rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-soft-fg';
      global.location.href = href;
    });
  }

  /* ---------------- 6. Footer year + misc ---------------- */
  function bootMisc() {
    qsa('[data-current-year]').forEach(function (n) {
      n.textContent = String(new Date().getFullYear());
    });
    qsa('[data-last-updated]').forEach(function (n) {
      if (!n.textContent.trim()) {
        n.textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    });
    qsa('[data-print-trigger]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (global.MathIt && global.MathIt.print) global.MathIt.print(b.getAttribute('data-print-trigger'));
        else global.print();
      });
    });
  }

  /* ---------------- 7. Print modes ----------------
     The <html> element carries one of:
       print-worksheet  questions only (default)
       print-answers    answer key only
       print-both       questions, page break, answer key
       print-set        a whole class set of different sheets
     @media print rules in app.css do the rest. The class is cleared again
     once the dialog closes so the screen view is never left in print mode. */
  const PRINT_MODES = ['print-worksheet', 'print-answers', 'print-both', 'print-set'];

  function setPrintMode(mode) {
    const root = D.documentElement;
    PRINT_MODES.forEach((c) => root.classList.remove(c));
    root.classList.add(PRINT_MODES.indexOf('print-' + mode) !== -1 ? 'print-' + mode : 'print-worksheet');
  }

  function clearPrintMode() {
    PRINT_MODES.forEach((c) => D.documentElement.classList.remove(c));
  }

  function doPrint(mode) {
    setPrintMode(mode || 'worksheet');
    // Let the class land before the (synchronous) print dialog opens.
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () { global.print(); });
    });
  }

  function bootPrint() {
    global.addEventListener('afterprint', clearPrintMode);
    try {
      const mq = global.matchMedia('print');
      const onChange = (ev) => { if (!ev.matches) clearPrintMode(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    } catch (e) { /* noop */ }
  }

  global.MathIt = global.MathIt || {};
  global.MathIt.print = doPrint;
  global.MathIt.setPrintMode = setPrintMode;
  global.MathIt.clearPrintMode = clearPrintMode;
  global.MathIt.syncModeControls = syncModeControls;

  function boot() {
    bootModes();
    bootPrint();
    bootNav();
    bootPicker();
    bootAccordions();
    bootContact();
    bootMisc();
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
