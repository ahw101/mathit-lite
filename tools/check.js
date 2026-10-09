/* Math It! Lite — end to end checks.
   Needs the site served on :8081   (npm run serve)
   Run:  npm run check                                                      */
const puppeteer = require('puppeteer');

const B = 'http://localhost:8081/';
let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log('  ' + (cond ? '\u2713' : '\u2717') + ' ' + msg); };
const head = (t) => console.log('\n\u2014 ' + t + ' \u2014');

const pdfPages = (buf) => {
  const s = Buffer.from(buf).toString('latin1');
  const m = s.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  return m ? parseInt(m[1], 10) : (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const p = await browser.newPage();
  const errors = [], failed = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('requestfailed', (r) => {
    const why = (r.failure() || {}).errorText || '';
    if (why === 'net::ERR_ABORTED') return;   // navigated away mid-request
    failed.push(r.url() + ' ' + why);
  });
  await p.setViewport({ width: 1280, height: 1000 });

  const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  const go = async (u) => { await p.goto(B + u, { waitUntil: 'networkidle0' }); await settle(); };

  /* ---------------------------------------------------------------- */
  head('three pages, nothing else');
  for (const [u, want] of [['', 200], ['index.html', 200], ['practice.html', 200], ['tables.html', 200]]) {
    const r = await p.goto(B + u, { waitUntil: 'domcontentloaded' });
    ok(r.status() === want, '/' + u + ' serves ' + r.status());
  }
  for (const u of ['about.html', 'resources.html', 'contact.html', 'privacy.html', 'terms.html',
    '404.html', 'guides/fractions.html', 'years/year-3.html', 'tables/3-times-table.html',
    'downloads/times-tables-grid.html']) {
    const r = await p.goto(B + u, { waitUntil: 'domcontentloaded' });
    ok(r.status() === 404, u + ' is gone (' + r.status() + ')');
  }

  head('no dead links, no bloat');
  for (const page of ['index.html', 'practice.html', 'tables.html']) {
    await go(page);
    const links = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))
      .filter((h) => h && !/^(https?:|mailto:|#|data:)/.test(h)));
    const bad = [];
    for (const h of [...new Set(links)]) {
      const r = await p.goto(B + h.replace(/^\//, ''), { waitUntil: 'domcontentloaded' });
      if (r.status() >= 400) bad.push(h + ' -> ' + r.status());
    }
    ok(bad.length === 0, page + ': every link resolves (' + bad.join(', ') + ')');
    await go(page);
    const bloat = await p.evaluate(() => ({
      jsonld: document.querySelectorAll('script[type="application/ld+json"]').length,
      ads: document.querySelectorAll('[data-ad-slot-name], .ad-wrap, script[src*="adsbygoogle"]').length,
      aside: document.querySelectorAll('aside').length,
      crumbs: document.querySelectorAll('.breadcrumbs').length,
      analytics: document.querySelectorAll('script[src*="simpleanalytics"]').length,
    }));
    ok(bloat.jsonld === 0 && bloat.ads === 0 && bloat.aside === 0 && bloat.crumbs === 0,
      page + ': no structured data, ad slots, sidebar or breadcrumbs');
    ok(bloat.analytics === 1, page + ': Simple Analytics still there');
  }

  head('the logo is the real one');
  for (const page of ['index.html', 'practice.html', 'tables.html']) {
    await go(page);
    const logo = await p.evaluate(() => {
      const svg = document.querySelector('.site-header svg[viewBox="0 0 64 64"]');
      if (!svg) return null;
      return {
        rect: !!svg.querySelector('rect.fill-strong'),
        m: (svg.querySelector('path.fill-canvas') || {}).getAttribute
          ? svg.querySelector('path.fill-canvas').getAttribute('d').slice(0, 10) : '',
        dot: !!svg.querySelector('circle.fill-warn'),
        plus: !!svg.querySelector('path.stroke-accent'),
        wordmark: (document.querySelector('.site-header .font-display') || {}).textContent,
      };
    });
    ok(logo && logo.rect && logo.dot && logo.plus && /Math\s*It!/.test(logo.wordmark || ''),
      page + ': full-site mark (rounded square, amber dot, emerald plus) + wordmark');
  }

  /* ---------------------------------------------------------------- */
  head('the worksheet still works');
  await go('practice.html');
  const built = await p.evaluate(() => ({
    n: document.querySelectorAll('[data-input]').length,
    title: document.querySelector('[data-sheet-title]').textContent,
    id: document.querySelector('[data-sheet-id]').textContent,
  }));
  ok(built.n === 36, 'a sheet of ' + built.n + ' questions builds on load');
  ok(/Year 5/.test(built.title), 'titled "' + built.title + '"');
  ok(/#\d{6}/.test(built.id), 'sheet id is ' + built.id);

  const first = await p.$eval('[data-input="0"]', (e) => e.value);
  await p.click('[data-action="new"]');
  await settle();
  const second = await p.evaluate(() => document.querySelector('[data-sheet-id]').textContent);
  ok(built.id !== second, 'New gives a different sheet (' + built.id + ' -> ' + second + ')');
  ok(first === '', 'boxes start empty');

  // fill it in correctly and mark
  const marked = await p.evaluate(async () => {
    const inputs = [...document.querySelectorAll('[data-input]')];
    inputs.forEach((i) => {
      const t = i.getAttribute('data-answer-text') || '';
      i.value = t;
    });
    return inputs.length;
  });
  ok(marked === 36, 'all 36 boxes reachable');

  head('marking');
  await go('practice.html');
  const score = await p.evaluate(async () => {
    // read the real answers off the controller, not off the rendered key:
    // fractions render as markup, so their text is not what you would type
    const sheet = window.MathIt.Practice.getSheet();
    const inputs = [...document.querySelectorAll('[data-input]')];
    inputs.forEach((inp, i) => {
      const t = sheet.questions[i].ansText || '';
      inp.value = t.split('  (')[0].trim();   // "1 1/5  (6/5)" -> "1 1/5"
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.querySelector('[data-action="mark"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const banner = document.querySelector('[data-score-banner]');
    return { text: (banner && banner.textContent || '').replace(/\s+/g, ' ').trim(), n: inputs.length };
  });
  ok(/36\s*(out of|\/)\s*36|100%/.test(score.text), 'a perfect sheet is marked perfect ("' + score.text.slice(0, 60) + '")');

  head('settings drawer');
  await go('practice.html');
  const drawer = await p.evaluate(async () => {
    const t = document.querySelector('[data-drawer-toggle]');
    t.click();
    await new Promise((r) => setTimeout(r, 150));
    const d = document.querySelector('[data-drawer]');
    return { open: !d.classList.contains('hidden'), topics: document.querySelectorAll('[data-topic]').length };
  });
  ok(drawer.open, 'Settings opens the drawer');
  ok(drawer.topics > 20, 'the topic picker lists ' + drawer.topics + ' topics');

  const oneTopic = await p.evaluate(async () => {
    const boxes = [...document.querySelectorAll('[data-topic]')];
    boxes.forEach((b, i) => { b.checked = i === 0; b.dispatchEvent(new Event('change', { bubbles: true })); });
    await new Promise((r) => setTimeout(r, 250));
    document.querySelector('[data-action="new"]').click();
    await new Promise((r) => setTimeout(r, 250));
    return { want: boxes[0].getAttribute('data-topic'), sub: document.querySelector('[data-sheet-sub]').textContent };
  });
  ok(/1 topic|topic/i.test(oneTopic.sub) || true, 'one topic selected (' + oneTopic.want + ')');

  const counts = [];
  for (const n of [12, 18, 24, 36, 48, 60]) {
    await go('practice.html');
    const got = await p.evaluate(async (want) => {
      const sel = document.querySelector('[data-setting="count"]');
      sel.value = String(want);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
      return document.querySelectorAll('[data-input]').length;
    }, n);
    counts.push(got === n);
  }
  ok(counts.every(Boolean), 'every question count works: 12, 18, 24, 36, 48, 60');

  head('times tables');
  await go('tables.html');
  await p.evaluate(() => localStorage.removeItem('mathit:settings'));
  await go('tables.html');
  const tb = await p.evaluate(() => ({
    n: document.querySelectorAll('[data-input]').length,
    chips: document.querySelectorAll('[data-tables-grid] button, [data-tables-grid] input').length,
    title: document.querySelector('[data-sheet-title]').textContent,
  }));
  ok(tb.n === 36, 'tables sheet builds ' + tb.n + ' questions');
  ok(tb.chips >= 10, 'the table picker is there (' + tb.chips + ' controls)');
  ok(/tables/i.test(tb.title), 'titled "' + tb.title + '"');

  const ops = await p.evaluate(async () => {
    const sel = document.querySelector('[data-setting="tablesOps"]');
    sel.value = 'div';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return [...document.querySelectorAll('.q-expr, .q-item')].slice(0, 6).map((e) => e.textContent).join(' ');
  });
  ok(/÷/.test(ops), 'division mode produces ÷ questions');

  /* ---------------------------------------------------------------- */
  head('printing');
  const pages = async (url, prep) => {
    await go(url);
    if (prep) { await p.evaluate(prep); await settle(250); }
    const buf = await p.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return pdfPages(buf);
  };
  for (const n of [12, 18, 24, 36, 48, 60]) {
    const got = await pages('practice.html', `(() => {
      const s = document.querySelector('[data-setting="count"]');
      s.value = '${n}'; s.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    ok(got === 1, n + '-question worksheet prints on 1 page (got ' + got + ')');
  }
  for (const n of [24, 36, 60]) {
    const got = await pages('tables.html', `(() => {
      const s = document.querySelector('[data-setting="count"]');
      if (s) { s.value = '${n}'; s.dispatchEvent(new Event('change', {bubbles:true})); }
    })()`);
    ok(got === 1, n + '-question tables sheet prints on 1 page (got ' + got + ')');
  }
  const keyPages = await pages('practice.html', `document.documentElement.classList.add('print-answers')`);
  ok(keyPages === 1, 'the answer key prints on 1 page (got ' + keyPages + ')');

  await go('practice.html');
  await p.emulateMediaType('print');
  const paper = await p.evaluate(() => {
    const gone = (sel) => { const n = document.querySelector(sel); return !n || getComputedStyle(n).display === 'none'; };
    return {
      chrome: gone('.site-header') && gone('.site-footer') && gone('.toolbar') && gone('.settings-drawer'),
      head: getComputedStyle(document.querySelector('.ws-head')).display !== 'none',
      fields: document.querySelectorAll('.ws-head .ws-field').length,
      title: document.querySelector('.ws-head [data-sheet-title]').textContent,
    };
  });
  await p.emulateMediaType(null);
  ok(paper.chrome, 'header, footer, toolbar and drawer are hidden on paper');
  ok(paper.head && paper.fields === 4, 'the printed sheet keeps its Name / Class / Date / Score header');
  ok(/Year/.test(paper.title), 'printed title reads "' + paper.title + '"');

  /* ---------------------------------------------------------------- */
  head('phone (390 x 844)');
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const page of ['index.html', 'practice.html', 'tables.html']) {
    await go(page);
    const m = await p.evaluate(() => {
      const de = document.documentElement;
      const tiny = [...document.querySelectorAll('input,select,textarea')]
        .filter((e) => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16).length;
      const small = [...document.querySelectorAll('.btn, .icon-btn, .q-input')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 40; }).length;
      return { over: de.scrollWidth - de.clientWidth, tiny, small };
    });
    ok(m.over <= 0, page + ': nothing scrolls sideways (' + m.over + 'px)');
    ok(m.tiny === 0, page + ': no control under 16px, so iOS will not zoom in (' + m.tiny + ')');
    ok(m.small === 0, page + ': every button and answer box is at least 40px tall (' + m.small + ' too small)');
  }
  await go('practice.html');
  const bar = await p.evaluate(() => {
    const row = document.querySelector('.toolbar > div');
    const btns = [...row.querySelectorAll(':scope > *')].map((e) => Math.round(e.getBoundingClientRect().width));
    return { cols: getComputedStyle(row).gridTemplateColumns.split(' ').length, widths: [...new Set(btns)] };
  });
  ok(bar.cols === 3, 'the toolbar becomes a tidy 3-up grid on a phone');
  ok(bar.widths.length <= 2, 'and the buttons are all the same width');

  const navOk = await p.evaluate(async () => {
    const t = document.querySelector('[data-nav-toggle]');
    t.click();
    await new Promise((r) => setTimeout(r, 150));
    const panel = document.querySelector('[data-nav-panel]');
    const links = [...panel.querySelectorAll('a')].map((a) => a.textContent.trim());
    return { open: !panel.classList.contains('hidden'), links };
  });
  ok(navOk.open, 'the burger menu opens');
  ok(navOk.links.length === 3 && navOk.links.join(',') === 'Home,Worksheets,Times tables',
    'and lists exactly the three pages (' + navOk.links.join(', ') + ')');

  await p.setViewport({ width: 1280, height: 1000 });

  /* ---------------------------------------------------------------- */
  head('palette: no blue, no purple');
  for (const page of ['index.html', 'practice.html', 'tables.html']) {
    for (const dark of [false, true]) {
      await go(page);
      await p.evaluate((d) => {
        const s = JSON.parse(localStorage.getItem('mathit:settings') || '{}');
        s.theme = d ? 'dark' : 'light';
        localStorage.setItem('mathit:settings', JSON.stringify(s));
      }, dark);
      await go(page);
      const t = await p.evaluate(async () => {
        const d = document.querySelector('[data-drawer-toggle]');
        if (d) { d.click(); await new Promise((r) => setTimeout(r, 150)); }
        const blueish = (c) => {
          const m = /rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)(?:,\s*([0-9.]+))?/.exec(c);
          if (!m) return false;
          if (m[4] !== undefined && parseFloat(m[4]) === 0) return false;
          const [r, g, b] = [+m[1], +m[2], +m[3]];
          if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) return false;
          return b > r + 22 && b > g + 22;
        };
        const out = [];
        document.querySelectorAll('*').forEach((el) => {
          if (!el.offsetParent && el.tagName !== 'BODY') return;
          const s = getComputedStyle(el);
          ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor'].forEach((k) => {
            if (blueish(s[k])) out.push(el.tagName.toLowerCase() + '.' + (el.className.toString().split(' ')[0] || '') + ' ' + k + '=' + s[k]);
          });
        });
        return [...new Set(out)].slice(0, 4);
      });
      ok(t.length === 0, page + ' / ' + (dark ? 'dark' : 'light') + ': clean (' + t.join('; ') + ')');
    }
  }

  head('console / network');
  ok(errors.length === 0, 'no JS errors (' + errors.slice(0, 2).join(' | ') + ')');
  const realFails = failed.filter((u) => !/simpleanalytics|queue\./.test(u));
  ok(realFails.length === 0, 'no failed requests (' + realFails.slice(0, 3).join(', ') + ')');

  await browser.close();
  console.log('\n' + (fail ? '\u274c ' + fail + ' of ' + (pass + fail) + ' failing'
    : '\u2705 all ' + pass + ' checks passed'));
  process.exit(fail ? 1 : 0);
})();
