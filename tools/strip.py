#!/usr/bin/env python3
"""Turn a full Math It! page into its Lite twin.

Same page, same controls, same behaviour — with the parts that are not the
tool taken out: structured data, ad slots, the sidebar, the essay underneath,
the breadcrumb trail and the footer link farm.
"""
import re
import sys

NAV_DESKTOP = """      <nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
          <a href="index.html" class="nav-link">Home</a>
          <a href="practice.html" class="nav-link"{WS}>Worksheets</a>
          <a href="tables.html" class="nav-link"{TT}>Times tables</a>
      </nav>"""

NAV_MOBILE = """      <nav class="flex flex-col gap-1" aria-label="Mobile">
          <a href="index.html" class="block w-full text-left nav-link">Home</a>
          <a href="practice.html" class="block w-full text-left nav-link"{WS}>Worksheets</a>
          <a href="tables.html" class="block w-full text-left nav-link"{TT}>Times tables</a>
      </nav>"""

FOOTER = """  <footer class="site-footer mt-16 border-t border-line bg-raise">
    <div class="mx-auto flex max-w-page flex-col gap-3 px-4 py-8 text-sm text-soft sm:flex-row sm:items-center sm:px-6 lg:px-8">
      <p>Math It! — free to use, free to photocopy, no account needed.</p>
      <nav class="flex gap-4 sm:ml-auto" aria-label="Footer">
        <a href="practice.html" class="hover:text-accent-text hover:underline">Worksheets</a>
        <a href="tables.html" class="hover:text-accent-text hover:underline">Times tables</a>
      </nav>
    </div>
  </footer>"""


def cut_between(s, start_marker, end_marker, keep_end=True, label=''):
    i = s.find(start_marker)
    if i == -1:
        raise SystemExit('missing start marker %r (%s)' % (start_marker[:50], label))
    j = s.find(end_marker, i)
    if j == -1:
        raise SystemExit('missing end marker %r (%s)' % (end_marker[:50], label))
    return s[:i] + (end_marker if keep_end else '') + s[j + len(end_marker):]


def strip(path, page):
    s = open(path, encoding='utf-8').read()
    before = len(s)

    # ---- head: structured data, ad plumbing, SEO padding ----
    s = re.sub(r'\n\s*<script type="application/ld\+json">.*?</script>', '', s, flags=re.S)
    s = re.sub(r'\n\s*<meta name="google-adsense-account"[^>]*>', '', s)
    s = re.sub(r'\n\s*<script async src="https://pagead2\.googlesyndication\.com.*?></script>', '', s, flags=re.S)
    for name in ('keywords', 'robots', 'author'):
        s = re.sub(r'\n\s*<meta name="%s"[^>]*>' % name, '', s)
    s = re.sub(r'\n\s*<meta name="twitter:[^"]*"[^>]*>', '', s)

    # ---- breadcrumbs ----
    s = re.sub(r'\n[^\n]*<!--[^\n]*BREADCRUMBS[^\n]*-->', '', s)
    s = re.sub(r'\n\s*<nav class="breadcrumbs[^"]*".*?</nav>', '', s, flags=re.S)

    # ---- one column instead of 9/3 with a sidebar ----
    s = re.sub(
        r'<div class="grid gap-8 lg:grid-cols-12">\s*'
        r'(?:<!--[^\n]*MAIN COLUMN[^\n]*-->\s*)?'
        r'<div class="lg:col-span-9">',
        '<div class="ws-main">', s, flags=re.S)

    # ---- everything after the sheet goes: ad, essay, sidebar ----
    anchor = '<div class="class-set" data-class-set aria-hidden="true"></div>'
    i = s.index(anchor) + len(anchor)
    j = s.index('</main>')
    s = s[:i] + '\n\n    </div>\n\n  ' + s[j:]

    # ---- navigation: only the pages that exist ----
    ws = ' aria-current="page"' if page == 'practice' else ''
    tt = ' aria-current="page"' if page == 'tables' else ''
    s = cut_between(s, '<nav class="ml-auto hidden items-center gap-1 md:flex"', '</nav>', keep_end=False)
    s = s.replace('      \n', '', 1)
    s = re.sub(r'(?=\n\s*<div class="ml-auto flex items-center gap-2 md:ml-3">)',
               '\n' + NAV_DESKTOP.replace('{WS}', ws).replace('{TT}', tt) + '\n', s, count=1)

    s = re.sub(r'<nav class="flex flex-col gap-1" aria-label="Mobile">.*?</nav>',
               NAV_MOBILE.replace('{WS}', ws).replace('{TT}', tt).strip(), s, flags=re.S)

    # header call to action points at the other tool, not at this page
    if page == 'practice':
        s = s.replace('<a href="practice.html" class="btn btn-primary btn-sm hidden sm:inline-flex">Make a worksheet</a>',
                      '<a href="tables.html" class="btn btn-primary btn-sm hidden sm:inline-flex">Times tables</a>')

    # ---- footer ----
    s = cut_between(s, '<footer class="site-footer', '</footer>', keep_end=False, label='footer')
    s = s.replace('\n  \n', '\n', 1)
    s = re.sub(r'(?=\n\s*<script src="assets/js/settings\.js">)', '\n' + FOOTER + '\n', s, count=1)

    # ---- noscript note must not point at pages lite does not have ----
    s = re.sub(r'browser, so the questions cannot be generated\. Please enable JavaScript, or read the\s*\n'
               r'\s*<a href="resources\.html" class="link">topic guides</a>, which are fully readable without it\.',
               'browser, so the questions cannot be generated. Please switch JavaScript on and reload.', s)

    s = re.sub(r'the questions cannot be built\. Please enable JavaScript, or print one of the\s*\n'
               r'\s*<a href="downloads/[^"]*" class="link">reference grids</a> instead\.',
               'the questions cannot be built. Please switch JavaScript on and reload.', s)

    # ---- scripts: no ads ----
    s = re.sub(r'\n\s*<script src="assets/js/ads\.js"></script>', '', s)

    # ---- lite stylesheet rides after the shared one ----
    s = s.replace('<link rel="stylesheet" href="assets/css/app.css">',
                  '<link rel="stylesheet" href="assets/css/app.css">\n'
                  '  <link rel="stylesheet" href="assets/css/lite.css">')

    s = re.sub(r'\n{3,}', '\n\n', s)
    open(path, 'w', encoding='utf-8').write(s)
    print('%-14s %6d -> %6d bytes  (-%d%%)' % (path, before, len(s), round(100 - len(s) * 100 / before)))


if __name__ == '__main__':
    strip('practice.html', 'practice')
    strip('tables.html', 'tables')
