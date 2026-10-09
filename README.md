# Math It! Lite

The Worksheets page and the Times tables page from the full Math It! site,
copied across as they are, with everything that is not the tool taken out.
Plus a short home page. Three pages, no build step — upload the folder.

```
index.html              home
practice.html           worksheet generator   (copy of the full site's page)
tables.html             times tables          (copy of the full site's page)
assets/css/app.css      the site stylesheet, unchanged
assets/css/lite.css     the only new CSS: column width + phone fixes
assets/js/*.js          settings, site, generator, practice — unchanged
tools/strip.py          regenerates the two pages from the full site
tools/check.js          75 end-to-end checks
```

## What was taken out

Identical pages, minus: JSON-LD/structured data, the AdSense loader and every
ad slot, `ads.js`, the sidebar, the essay under the sheet, breadcrumbs, the
footer link farm, `keywords`/`robots`/Twitter-card meta, and nav links to the
41 guides, year pages and legal pages that Lite does not have.

`practice.html` is **44% smaller**, `tables.html` **50% smaller**. Simple
Analytics stays.

## What was kept

Everything the tool does. Same JS, so: year and difficulty, the 32-topic
picker, question counts, times-table selection and ranges, timer, instant
marking, reveal answers, on-screen answer key, print menu (questions / key /
both), class sets, keyboard shortcuts, share links, light and dark.

## Regenerating

The two pages are **generated**, not hand-edited, so the full site stays the
single source of truth:

```bash
cp ../mathit/practice.html ../mathit/tables.html .
npm run sync          # python3 tools/strip.py
```

Edit `tools/strip.py`, never the generated HTML.

## Phone

`assets/css/lite.css` fixes what the full site's layout does on a 390px screen:

- **No sideways scroll.** The question row was `nowrap` around a fixed 8rem
  answer box, so a long expression pushed the tick/cross badge off-screen.
- **No zoom-jump on tap.** Every control was 14px; iOS zooms the page in
  whenever you focus anything under 16px. All inputs are now 16px.
- **Thumb-sized targets.** Buttons and answer boxes were 36–38px, now 44px.
- **A usable toolbar.** Six controls on a wrapping flex row made three ragged
  lines; it is now a 3-up grid of equal buttons, two rows.
- The print dropdown was wider than the screen; it is now pinned to the viewport.

## Testing

```bash
npm run serve     # http://localhost:8081
npm run check     # 75 assertions
```

Covers: only three pages exist and the other ten 404; every link resolves; no
structured data, ads, sidebar or breadcrumbs survive; the real logo is on all
three pages; sheets build, mark (a perfect sheet scores 100%) and reprint;
every question count prints on **one page**, verified by rendering real PDFs;
phone layout; and no blue or purple in either theme.

## Notes

- Palette is stone / charcoal / emerald / amber, no blue or purple — tested.
- `ads.txt` is still there if you ever want slots back; there are none now.
- The full site at `../mathit/` is untouched.
