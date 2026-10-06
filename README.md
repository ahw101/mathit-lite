# Math It! Lite

Three pages. No build step to deploy. Upload the folder and it works.

```
index.html      home — a heading, a line, two cards, five year chips
practice.html   worksheet generator, Years 2–6
tables.html     times tables, any number of questions up to 500
app.css         compiled Tailwind (23 kB)
js/generator.js question engine
js/lite.js      the entire UI (13 kB)
```

## What it does

Pick your settings, press **New sheet**, and you get fresh questions. Type answers
on screen and press **Mark it**, or print the sheet and do it on paper.
Keyboard: `N` new, `M` mark, `A` answers, `P` print, `Enter` to jump to the next box.

Settings are remembered per page in `localStorage`, and can be set by URL:

```
practice.html?year=3&level=easy&count=10
tables.html?tables=3,4&ops=div&max=12&count=60
```

## Printing

The sheet is laid out to fill a page and stop. `printPlan(n)` in `js/lite.js`
picks the column count and row density, then tells you up front whether it will
be one page or more — verified against real PDFs, not guessed:

| Questions | 12 | 24 | 36 | 60 | 100 | 400 |
|-----------|----|----|----|----|-----|-----|
| Pages     | 1  | 1  | 1  | 1  | 1   | 3   |

Controls, header and footer don't print. The sheet gets a Name / Class / Date /
Score line instead.

## Developing

```bash
npm run build    # compile src/lite.src.css -> app.css
npm run watch
npm run serve    # http://localhost:8081
```

Tailwind is a local dependency, not the CDN, so the site works offline.
`node ../mathit/litecheck.js` runs the 48-assertion end-to-end suite against
a server on :8081.

## Notes

- Palette is stone / charcoal / emerald / amber. No blue, no purple, including
  focus rings — there's a test for it.
- Light / Auto / Dark, no flash on load.
- Analytics is Simple Analytics; `ads.txt` and the AdSense loader are in place,
  but there are no ad slots on the page.
