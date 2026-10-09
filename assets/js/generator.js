/* =====================================================================
   MATH IT!  —  Question Generator Engine
   ---------------------------------------------------------------------
   A dependency-free question factory covering the England National
   Curriculum for mathematics, Years 2–6 (Key Stage 1 upper / Key Stage 2).

   Every topic exposes a generator that receives a context:
       { year: 2..6, level: 'easy'|'medium'|'hard', pw: 0..6 }
   where `pw` ("power") is a blended difficulty scalar:
       pw = (year - 2) + levelIndex   →  clamped 0..6

   A generated question is a plain object:
       {
         topic   : 'frac-mult-int',
         html    : '<span>…</span>',   // the question body (no "=" sign)
         equals  : true|false,         // render an "=" before the input
         type    : 'number'|'fraction'|'remainder'|'ratio'|'text',
         value   : Number,             // canonical numeric value (if any)
         ansHtml : '<span>…</span>',   // pretty answer for reveal/marking
         ansText : '3/4',              // plain-text answer (print/aria)
         wide    : false,              // needs a wider input box
         key     : 'unique-string'     // used for de-duplication
       }

   Exposed as  window.MathIt.Generator
   ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     Small maths / formatting helpers
     ------------------------------------------------------------------ */
  const R = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const coin = (p = 0.5) => Math.random() < p;

  function shuffle(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
  }

  const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

  /** Kill binary float noise: 0.1+0.2 → 0.3 */
  const clean = (x) => parseFloat(x.toPrecision(12));

  /** Thousands separators, decimals preserved. */
  function cm(n) {
    const neg = n < 0;
    const [i, d] = Math.abs(clean(n)).toString().split('.');
    const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + s + (d ? '.' + d : '');
  }

  /** Plain number, no separators (used for answer text). */
  const pn = (n) => String(clean(n)).replace('-', '−');

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function simplify(n, d) {
    const g = gcd(n, d);
    let nn = n / g, dd = d / g;
    if (dd < 0) { nn = -nn; dd = -dd; }
    return [nn, dd];
  }

  /* ------------------------------------------------------------------
     HTML builders
     ------------------------------------------------------------------ */
  const el = (cls, inner) => `<span class="${cls}">${inner}</span>`;

  function fracHtml(n, d) {
    const neg = n < 0;
    return (neg ? '−' : '') +
      `<span class="frac"><span class="num">${Math.abs(n)}</span><span class="den">${d}</span></span>`;
  }

  function mixedHtml(whole, n, d) {
    if (!n) return String(whole);
    if (!whole) return fracHtml(n, d);
    const neg = whole < 0;
    return `<span class="mixnum">${neg ? '−' : ''}${Math.abs(whole)}${fracHtml(n, d)}</span>`;
  }

  /** Renders a vulgar fraction as the tidiest possible answer. */
  function fracAnswerHtml(n, d) {
    const [sn, sd] = simplify(n, d);
    if (sd === 1) return String(sn);
    if (Math.abs(sn) > sd) {
      const sign = sn < 0 ? -1 : 1;
      const a = Math.abs(sn);
      const w = Math.floor(a / sd) * sign;
      const r = a % sd;
      return `${mixedHtml(w, r, sd)} <span class="op">=</span> ${fracHtml(sn, sd)}`;
    }
    return fracHtml(sn, sd);
  }

  function fracAnswerText(n, d) {
    const [sn, sd] = simplify(n, d);
    if (sd === 1) return String(sn);
    if (Math.abs(sn) > sd) {
      const sign = sn < 0 ? '-' : '';
      const a = Math.abs(sn);
      return `${sign}${Math.floor(a / sd)} ${a % sd}/${sd}  (${sn}/${sd})`;
    }
    return `${sn}/${sd}`;
  }

  /** A numerator coprime to d, so printed fractions are always in lowest terms. */
  const COPRIME_CACHE = {};
  function cn(d) {
    if (!COPRIME_CACHE[d]) {
      const opts = [];
      for (let n = 1; n < d; n++) if (gcd(n, d) === 1) opts.push(n);
      COPRIME_CACHE[d] = opts.length ? opts : [1];
    }
    return pick(COPRIME_CACHE[d]);
  }

  /* The answer box is rendered inline, exactly where the missing value sits. */
  const BOX = '<span class="boxed" data-box aria-hidden="true">?</span>';
  const OP = (s) => `<span class="op">${s}</span>`;

  /** Build a fraction-type answer payload. */
  function fracAns(n, d) {
    const [sn, sd] = simplify(n, d);
    return {
      type: 'fraction',
      value: sn / sd,
      frac: [sn, sd],
      ansHtml: fracAnswerHtml(sn, sd),
      ansText: fracAnswerText(sn, sd),
      wide: true,
    };
  }

  /** Build a plain numeric answer payload. */
  function numAns(v) {
    const value = clean(v);
    return { type: 'number', value, ansHtml: cm(value), ansText: pn(value) };
  }

  /* ==================================================================
     TOPIC LIBRARY
     ================================================================== */
  const TOPICS = [];
  function topic(def) { TOPICS.push(def); return def; }

  /* ---------- GROUP: Mental arithmetic ---------- */

  const ADD_BANDS = [[2, 9], [10, 49], [11, 99], [25, 299], [120, 1999], [1500, 9999], [4000, 49999]];

  topic({
    id: 'mental-add', label: 'Addition', group: 'Mental arithmetic',
    years: [2, 3, 4, 5, 6],
    blurb: 'Column and mental addition, scaled from two-digit to five-digit numbers.',
    gen(c) {
      const [lo, hi] = ADD_BANDS[clamp(c.pw, 0, 6)];
      const a = R(lo, hi);
      const b = c.pw <= 1 ? R(1, Math.max(9, Math.floor(hi / 3))) : R(lo, hi);
      return Object.assign({
        html: `${cm(a)} ${OP('+')} ${cm(b)}`,
        key: `add-${a}-${b}`,
      }, numAns(a + b));
    },
  });

  topic({
    id: 'mental-sub', label: 'Subtraction', group: 'Mental arithmetic',
    years: [2, 3, 4, 5, 6],
    blurb: 'Subtraction with and without exchange, including larger integers.',
    gen(c) {
      const [lo, hi] = ADD_BANDS[clamp(c.pw, 0, 6)];
      let a = R(lo + Math.floor(hi / 4), hi);
      let b = R(lo, Math.max(lo + 1, a - 1));
      if (b > a) [a, b] = [b, a];
      return Object.assign({
        html: `${cm(a)} ${OP('−')} ${cm(b)}`,
        key: `sub-${a}-${b}`,
      }, numAns(a - b));
    },
  });

  topic({
    id: 'times-tables', label: 'Multiplication facts', group: 'Mental arithmetic',
    years: [2, 3, 4, 5, 6],
    blurb: 'Times-table recall up to 12 × 12, extending to two- and three-digit factors.',
    gen(c) {
      let a, b;
      if (c.pw <= 1) { a = pick([2, 5, 10, 3, 4]); b = R(2, 12); }
      else if (c.pw <= 2) { a = pick([2, 3, 4, 5, 8, 10]); b = R(2, 12); }
      else if (c.pw <= 3) { a = R(2, 12); b = R(2, 12); }
      else if (c.pw <= 4) { a = R(11, 49); b = R(3, 9); }
      else { a = R(110, 899); b = R(3, 9); }
      return Object.assign({
        html: `${cm(a)} ${OP('×')} ${cm(b)}`,
        key: `mul-${a}-${b}`,
      }, numAns(a * b));
    },
  });

  topic({
    id: 'division-facts', label: 'Division facts', group: 'Mental arithmetic',
    years: [2, 3, 4, 5, 6],
    blurb: 'Exact division derived from known multiplication facts.',
    gen(c) {
      let d, q;
      if (c.pw <= 1) { d = pick([2, 5, 10]); q = R(2, 12); }
      else if (c.pw <= 3) { d = R(2, 12); q = R(2, 12); }
      else { d = R(3, 12); q = R(11, 99); }
      return Object.assign({
        html: `${cm(d * q)} ${OP('÷')} ${cm(d)}`,
        key: `div-${d * q}-${d}`,
      }, numAns(q));
    },
  });

  topic({
    id: 'doubling-halving', label: 'Doubling & halving', group: 'Mental arithmetic',
    years: [2, 3, 4, 5],
    blurb: 'Doubling and halving strategies, a cornerstone of mental fluency.',
    gen(c) {
      const band = [[5, 25], [10, 60], [20, 240], [50, 900], [250, 4800]][clamp(c.pw, 0, 4)];
      if (coin()) {
        const n = R(band[0], band[1]);
        return Object.assign({
          html: `<span class="q-prompt">Double ${cm(n)}</span>`, equals: true,
          key: `dbl-${n}`,
        }, numAns(n * 2));
      }
      const n = R(band[0], band[1]) * 2;
      return Object.assign({
        html: `<span class="q-prompt">Half of ${cm(n)}</span>`, equals: true,
        key: `hlf-${n}`,
      }, numAns(n / 2));
    },
  });

  topic({
    id: 'number-bonds', label: 'Number bonds', group: 'Mental arithmetic',
    years: [2, 3, 4, 5],
    blurb: 'Complements to 10, 20, 100, 1000 and 1 — rapid recall of pairs.',
    gen(c) {
      const target = [10, 20, 100, 100, 1000][clamp(c.pw, 0, 4)];
      const a = target <= 20 ? R(1, target - 1) : (coin(0.6) ? R(1, target / 10 - 1) * 10 : R(1, target - 1));
      return Object.assign({
        html: `${cm(a)} ${OP('+')} ${BOX} ${OP('=')} ${cm(target)}`, equals: false,
        key: `bond-${target}-${a}`,
      }, numAns(target - a));
    },
  });

  /* ---------- GROUP: Place value, rounding & powers of ten ---------- */

  topic({
    id: 'place-value', label: 'Place value', group: 'Number & place value',
    years: [3, 4, 5, 6],
    blurb: 'Identifying the value of a digit in integers and decimals.',
    gen(c) {
      if (c.pw >= 4 && coin(0.45)) {
        const digits = [R(1, 9), R(1, 9), R(1, 9), R(1, 9)];
        const n = `${digits[0]}.${digits[1]}${digits[2]}${digits[3]}`;
        const pos = R(1, 3);
        const val = digits[pos] / Math.pow(10, pos);
        return Object.assign({
          html: `<span class="q-prompt">Value of <strong>${digits[pos]}</strong> in ${n}</span>`, equals: false,
          key: `pv-dec-${n}-${pos}`,
        }, numAns(val));
      }
      const len = clamp(3 + Math.floor(c.pw / 2), 3, 6);
      let digits = [];
      for (let i = 0; i < len; i++) digits.push(i === 0 ? R(1, 9) : R(0, 9));
      let pos = R(0, len - 1);
      while (digits[pos] === 0) { digits[pos] = R(1, 9); }
      const n = Number(digits.join(''));
      const val = digits[pos] * Math.pow(10, len - 1 - pos);
      return Object.assign({
        html: `<span class="q-prompt">Value of <strong>${digits[pos]}</strong> in ${cm(n)}</span>`, equals: false,
        key: `pv-${n}-${pos}`,
      }, numAns(val));
    },
  });

  topic({
    id: 'rounding', label: 'Rounding', group: 'Number & place value',
    years: [3, 4, 5, 6],
    blurb: 'Rounding integers to powers of ten and decimals to 1 or 2 places.',
    gen(c) {
      if (c.pw >= 4 && coin(0.45)) {
        const dp = coin() ? 1 : 2;
        const n = clean(R(100, 9999) / 1000 + R(1, 40));
        const txt = n.toFixed(3);
        const rounded = clean(Number((+txt).toFixed(dp)));
        return Object.assign({
          html: `<span class="q-prompt">Round ${txt} to ${dp} d.p.</span>`, equals: false,
          key: `rnd-dp-${txt}-${dp}`,
        }, numAns(rounded));
      }
      const unit = [10, 10, 100, 100, 1000, 1000, 10000][clamp(c.pw, 0, 6)];
      const n = R(unit * 2 + 1, unit * 97);
      const rounded = Math.round(n / unit) * unit;
      const name = unit === 10 ? 'nearest 10' : unit === 100 ? 'nearest 100' : unit === 1000 ? 'nearest 1000' : 'nearest 10 000';
      return Object.assign({
        html: `<span class="q-prompt">Round ${cm(n)} to ${name}</span>`, equals: false,
        key: `rnd-${n}-${unit}`,
      }, numAns(rounded));
    },
  });

  topic({
    id: 'powers-of-ten', label: 'Multiply & divide by 10, 100, 1000', group: 'Decimals & percentages',
    years: [4, 5, 6],
    blurb: 'Shifting digits through place value columns — e.g. 36.08 × 1000.',
    gen(c) {
      const pow = c.pw <= 2 ? pick([10, 100]) : pick([10, 100, 1000]);
      const dp = c.pw <= 2 ? R(0, 1) : R(1, 3);
      const base = R(1, 999) + (dp ? R(1, Math.pow(10, dp) - 1) / Math.pow(10, dp) : 0);
      const n = clean(Number(base.toFixed(dp)));
      if (coin()) {
        return Object.assign({
          html: `${n} ${OP('×')} ${cm(pow)}`,
          key: `p10m-${n}-${pow}`,
        }, numAns(n * pow));
      }
      return Object.assign({
        html: `${cm(clean(n * pow))} ${OP('÷')} ${cm(pow)}`,
        key: `p10d-${n}-${pow}`,
      }, numAns(n));
    },
  });

  /* ---------- GROUP: Written methods ---------- */

  topic({
    id: 'long-mult', label: 'Long multiplication', group: 'Written methods',
    years: [4, 5, 6],
    blurb: 'Formal written multiplication, up to 3-digit × 2-digit numbers.',
    gen(c) {
      let a, b;
      if (c.pw <= 2) { a = R(12, 99); b = R(3, 9); }
      else if (c.pw <= 3) { a = R(102, 999); b = R(3, 9); }
      else if (c.pw <= 4) { a = R(12, 99); b = R(12, 49); }
      else { a = R(112, 989); b = R(12, 79); }
      return Object.assign({
        html: `${cm(a)} ${OP('×')} ${cm(b)}`,
        key: `lmul-${a}-${b}`, wide: true,
      }, numAns(a * b));
    },
  });

  topic({
    id: 'short-div', label: 'Short division (remainders)', group: 'Written methods',
    years: [4, 5, 6],
    blurb: 'Bus-stop division by a single digit, answers given with remainders.',
    gen(c) {
      const d = c.pw <= 2 ? R(2, 6) : R(3, 9);
      const q = c.pw <= 2 ? R(11, 99) : c.pw <= 4 ? R(101, 999) : R(1001, 9999);
      const r = R(1, d - 1);
      return {
        html: `${cm(d * q + r)} ${OP('÷')} ${cm(d)}`,
        type: 'remainder', value: q + r / d, rem: { q, r },
        ansHtml: `${cm(q)} r ${r}`, ansText: `${q} r ${r}`,
        wide: true, placeholder: '… r …',
        key: `sdiv-${d * q + r}-${d}`,
      };
    },
  });

  topic({
    id: 'long-div', label: 'Long division', group: 'Written methods',
    years: [5, 6],
    blurb: '4-digit ÷ 2-digit by the formal method, exact or with a remainder.',
    gen(c) {
      const d = c.pw <= 4 ? R(11, 25) : R(12, 49);
      const q = c.pw <= 4 ? R(12, 99) : R(21, 299);
      const exact = c.pw <= 4 ? coin(0.6) : coin(0.35);
      if (exact) {
        return Object.assign({
          html: `${cm(d * q)} ${OP('÷')} ${cm(d)}`,
          key: `ldiv-${d * q}-${d}`, wide: true,
        }, numAns(q));
      }
      const r = R(1, d - 1);
      return {
        html: `${cm(d * q + r)} ${OP('÷')} ${cm(d)}`,
        type: 'remainder', value: q + r / d, rem: { q, r },
        ansHtml: `${cm(q)} r ${r}`, ansText: `${q} r ${r}`,
        wide: true, placeholder: '… r …',
        key: `ldivr-${d * q + r}-${d}`,
      };
    },
  });

  /* ---------- GROUP: Fractions ---------- */

  topic({
    id: 'frac-mult-int', label: 'Fraction × integer', group: 'Fractions',
    years: [4, 5, 6],
    blurb: 'Multiplying a proper fraction by a whole number, e.g. ¾ × 16.',
    gen(c) {
      const d = pick(c.pw <= 3 ? [2, 3, 4, 5, 10] : [3, 4, 5, 6, 7, 8, 9, 12]);
      const n = cn(d);
      const exact = c.pw <= 4 ? coin(0.75) : coin(0.3);
      const k = exact ? d * R(2, c.pw <= 3 ? 6 : 12) : R(4, 40);
      const num = n * k;
      return Object.assign({
        html: `${fracHtml(n, d)} ${OP('×')} ${cm(k)}`,
        key: `fxi-${n}-${d}-${k}`,
      }, fracAns(num, d));
    },
  });

  topic({
    id: 'frac-of-amount', label: 'Fraction of an amount', group: 'Fractions',
    years: [3, 4, 5, 6],
    blurb: 'Finding unit and non-unit fractions of quantities.',
    gen(c) {
      const d = pick(c.pw <= 2 ? [2, 3, 4, 5, 10] : [3, 4, 5, 6, 8, 9, 12]);
      const n = c.pw <= 2 ? 1 : cn(d);
      const k = d * R(2, c.pw <= 2 ? 8 : c.pw <= 4 ? 20 : 60);
      return Object.assign({
        html: `${fracHtml(n, d)} <span class="q-prompt">of ${cm(k)}</span>`,
        key: `foa-${n}-${d}-${k}`,
      }, numAns(n * k / d));
    },
  });

  topic({
    id: 'frac-add-sub', label: 'Adding & subtracting fractions', group: 'Fractions',
    years: [3, 4, 5, 6],
    blurb: 'Same denominators first, then different denominators with a common multiple.',
    gen(c) {
      let d1, d2;
      if (c.pw <= 2) { d1 = d2 = pick([3, 4, 5, 6, 8, 10]); }
      else if (c.pw <= 4) { d1 = pick([2, 3, 4, 5, 6]); d2 = d1 * pick([2, 3, 4]); }
      else { d1 = pick([2, 3, 4, 5, 6, 7, 8]); d2 = pick([3, 4, 5, 6, 7, 9, 10].filter((x) => x !== d1)); }
      let n1 = cn(d1), n2 = cn(d2);
      const sub = coin(0.45);
      if (sub) {
        // guarantee a positive result
        if (n1 / d1 < n2 / d2) { [n1, n2] = [n2, n1]; [d1, d2] = [d2, d1]; }
        if (n1 * d2 === n2 * d1) {
          if (n2 > 1) n2 -= 1; else if (n1 < d1 - 1) n1 += 1; else n2 = 1, n1 = Math.max(1, n1 - 1);
        }
        const L = lcm(d1, d2);
        return Object.assign({
          html: `${fracHtml(n1, d1)} ${OP('−')} ${fracHtml(n2, d2)}`,
          key: `fsub-${n1}-${d1}-${n2}-${d2}`,
        }, fracAns(n1 * (L / d1) - n2 * (L / d2), L));
      }
      const L = lcm(d1, d2);
      return Object.assign({
        html: `${fracHtml(n1, d1)} ${OP('+')} ${fracHtml(n2, d2)}`,
        key: `fadd-${n1}-${d1}-${n2}-${d2}`,
      }, fracAns(n1 * (L / d1) + n2 * (L / d2), L));
    },
  });

  topic({
    id: 'frac-mult-frac', label: 'Fraction × fraction', group: 'Fractions',
    years: [5, 6],
    blurb: 'Multiplying pairs of proper fractions and simplifying the result.',
    gen(c) {
      const d1 = pick([2, 3, 4, 5, 6, 8]);
      const d2 = pick([3, 4, 5, 6, 7, 9]);
      const n1 = cn(d1), n2 = cn(d2);
      return Object.assign({
        html: `${fracHtml(n1, d1)} ${OP('×')} ${fracHtml(n2, d2)}`,
        key: `fxf-${n1}-${d1}-${n2}-${d2}`,
      }, fracAns(n1 * n2, d1 * d2));
    },
  });

  topic({
    id: 'frac-div-int', label: 'Fraction ÷ whole number', group: 'Fractions',
    years: [5, 6],
    blurb: 'Dividing a proper fraction by an integer, e.g. ⅗ ÷ 4.',
    gen(c) {
      const d = pick([2, 3, 4, 5, 6, 7, 8]);
      const n = cn(d);
      const k = R(2, c.pw <= 4 ? 5 : 9);
      return Object.assign({
        html: `${fracHtml(n, d)} ${OP('÷')} ${cm(k)}`,
        key: `fdi-${n}-${d}-${k}`,
      }, fracAns(n, d * k));
    },
  });

  topic({
    id: 'frac-div-frac', label: 'Fraction ÷ fraction', group: 'Fractions',
    years: [6],
    blurb: 'Dividing by a fraction using the reciprocal, e.g. ½ ÷ ¾.',
    gen() {
      const d1 = pick([2, 3, 4, 5, 6, 8]);
      const d2 = pick([2, 3, 4, 5, 6, 7]);
      const n1 = cn(d1), n2 = cn(d2);
      return Object.assign({
        html: `${fracHtml(n1, d1)} ${OP('÷')} ${fracHtml(n2, d2)}`,
        key: `fdf-${n1}-${d1}-${n2}-${d2}`,
      }, fracAns(n1 * d2, d1 * n2));
    },
  });

  topic({
    id: 'mixed-improper', label: 'Mixed numbers ↔ improper', group: 'Fractions',
    years: [5, 6],
    blurb: 'Converting between mixed numbers and improper (top-heavy) fractions.',
    gen(c) {
      const d = pick([2, 3, 4, 5, 6, 7, 8, 9]);
      const w = R(1, c.pw <= 4 ? 5 : 11);
      const n = cn(d);
      if (coin()) {
        return Object.assign({
          html: `<span class="q-prompt">${mixedHtml(w, n, d)} as an improper fraction</span>`, equals: false,
          key: `m2i-${w}-${n}-${d}`,
        }, fracAns(w * d + n, d));
      }
      const imp = w * d + n;
      return Object.assign({
        html: `<span class="q-prompt">${fracHtml(imp, d)} as a mixed number</span>`, equals: false,
        key: `i2m-${imp}-${d}`,
      }, fracAns(imp, d));
    },
  });

  topic({
    id: 'frac-simplify', label: 'Simplifying fractions', group: 'Fractions',
    years: [4, 5, 6],
    blurb: 'Cancelling to the lowest terms using common factors.',
    gen(c) {
      const d = pick([2, 3, 4, 5, 6, 7, 8, 9, 11]);
      const n = cn(d);
      const k = R(2, c.pw <= 3 ? 5 : 12);
      const [, sd] = simplify(n * k, d * k);
      return Object.assign({
        html: `<span class="q-prompt">Simplify ${fracHtml(n * k, d * k)}</span>`, equals: false,
        key: `fsimp-${n * k}-${d * k}-${sd}`,
      }, fracAns(n, d));
    },
  });

  /* ---------- GROUP: Decimals & percentages ---------- */

  topic({
    id: 'decimal-add-sub', label: 'Decimal addition & subtraction', group: 'Decimals & percentages',
    years: [4, 5, 6],
    blurb: 'Adding and subtracting decimals with a different number of places.',
    gen(c) {
      const dpA = c.pw <= 3 ? 1 : R(1, 3);
      const dpB = c.pw <= 3 ? R(1, 2) : R(1, 3);
      const mag = c.pw <= 3 ? 50 : 500;
      const a = clean(Number((R(1, mag) + R(1, Math.pow(10, dpA) - 1) / Math.pow(10, dpA)).toFixed(dpA)));
      const b = clean(Number((R(1, Math.max(2, Math.floor(mag / 2))) + R(1, Math.pow(10, dpB) - 1) / Math.pow(10, dpB)).toFixed(dpB)));
      if (coin(0.5)) {
        return Object.assign({
          html: `${a} ${OP('+')} ${b}`,
          key: `dadd-${a}-${b}`, wide: true,
        }, numAns(a + b));
      }
      const [hi, lo] = a >= b ? [a, b] : [b, a];
      return Object.assign({
        html: `${hi} ${OP('−')} ${lo}`,
        key: `dsub-${hi}-${lo}`, wide: true,
      }, numAns(hi - lo));
    },
  });

  topic({
    id: 'decimal-mult', label: 'Decimal multiplication', group: 'Decimals & percentages',
    years: [5, 6],
    blurb: 'Multiplying decimals by integers and by other decimals.',
    gen(c) {
      if (c.pw >= 5 && coin(0.45)) {
        const a = clean(R(2, 9) / 10), b = clean(R(2, 9) / 10);
        return Object.assign({
          html: `${a} ${OP('×')} ${b}`,
          key: `dmul-${a}-${b}`,
        }, numAns(a * b));
      }
      const a = clean(Number((R(1, 19) + R(1, 9) / 10).toFixed(1)));
      const b = R(3, 9);
      return Object.assign({
        html: `${a} ${OP('×')} ${b}`,
        key: `dmuli-${a}-${b}`,
      }, numAns(a * b));
    },
  });

  topic({
    id: 'decimal-div', label: 'Decimal division', group: 'Decimals & percentages',
    years: [5, 6],
    blurb: 'Dividing decimals by integers, with exact decimal answers.',
    gen(c) {
      if (c.pw >= 5 && coin(0.4)) {
        const b = clean(R(2, 9) / 10);
        const q = R(2, 12);
        return Object.assign({
          html: `${clean(b * q)} ${OP('÷')} ${b}`,
          key: `ddivd-${clean(b * q)}-${b}`,
        }, numAns(q));
      }
      const d = R(2, 9);
      const q = clean(R(1, 12) + R(1, 9) / 10);   // always a genuine decimal
      return Object.assign({
        html: `${clean(q * d)} ${OP('÷')} ${d}`,
        key: `ddiv-${clean(q * d)}-${d}`,
      }, numAns(q));
    },
  });

  topic({
    id: 'percent-of', label: 'Percentage of an amount', group: 'Decimals & percentages',
    years: [5, 6],
    blurb: 'Percentages of quantities, e.g. 60% of 2200 and 4% of 3000.',
    gen(c) {
      const pcts = c.pw <= 4 ? [10, 20, 25, 50, 75, 5] : [4, 6, 12, 15, 17, 30, 35, 60, 80, 95, 2.5];
      const p = pick(pcts);
      const base = c.pw <= 4 ? R(2, 40) * 10 : R(2, 60) * 100;
      return Object.assign({
        html: `<span class="q-prompt">${p}% of ${cm(base)}</span>`, equals: true,
        key: `pct-${p}-${base}`,
      }, numAns(p * base / 100));
    },
  });

  topic({
    id: 'fdp-convert', label: 'Fractions ↔ decimals ↔ %', group: 'Decimals & percentages',
    years: [5, 6],
    blurb: 'Moving fluently between the three representations of proportion.',
    gen(c) {
      const mode = R(0, 2);
      if (mode === 0) {
        const d = pick([2, 4, 5, 8, 10, 20, 25]);
        const n = cn(d);
        return Object.assign({
          html: `<span class="q-prompt">${fracHtml(n, d)} as a decimal</span>`, equals: false,
          key: `f2d-${n}-${d}`,
        }, numAns(n / d));
      }
      if (mode === 1) {
        const v = clean(R(1, 99) / 100);
        return Object.assign({
          html: `<span class="q-prompt">${v} as a percentage</span>`, equals: false,
          key: `d2p-${v}`, suffix: '%',
        }, numAns(clean(v * 100)));
      }
      const p = pick([5, 10, 15, 20, 24, 25, 35, 40, 45, 50, 60, 64, 75, 80, 85, 90]);
      return Object.assign({
        html: `<span class="q-prompt">${p}% as a fraction</span>`, equals: false,
        key: `p2f-${p}`,
      }, fracAns(p, 100));
    },
  });

  /* ---------- GROUP: Reasoning, algebra & structure ---------- */

  topic({
    id: 'missing-number', label: 'Missing number equations', group: 'Reasoning & algebra',
    years: [2, 3, 4, 5, 6],
    blurb: 'Inverse reasoning with the unknown in every possible position.',
    gen(c) {
      const scale = [20, 100, 500, 1000, 5000, 9999, 50000][clamp(c.pw, 0, 6)];

      // Hard variant: balancing an equation across both sides — □ × 12 = 889 × 6
      if (c.pw >= 4 && coin(0.35)) {
        const b = R(3, 12);
        const d = R(3, 12);
        const rightA = R(101, 999);
        const product = rightA * d;
        if (product % b === 0) {
          return Object.assign({
            html: `${BOX} ${OP('×')} ${b} ${OP('=')} ${cm(rightA)} ${OP('×')} ${d}`, equals: false,
            key: `bal-${b}-${rightA}-${d}`, wide: true,
          }, numAns(product / b));
        }
      }

      const form = R(0, 5);
      if (form === 0) { // □ + b = c
        const b = R(5, scale), ans = R(5, scale);
        return Object.assign({
          html: `${BOX} ${OP('+')} ${cm(b)} ${OP('=')} ${cm(ans + b)}`, equals: false,
          key: `mn0-${b}-${ans}`,
        }, numAns(ans));
      }
      if (form === 1) { // a + □ = c
        const a = R(5, scale), ans = R(5, scale);
        return Object.assign({
          html: `${cm(a)} ${OP('+')} ${BOX} ${OP('=')} ${cm(a + ans)}`, equals: false,
          key: `mn1-${a}-${ans}`,
        }, numAns(ans));
      }
      if (form === 2) { // □ − b = c
        const b = R(5, scale), ans = R(5, scale);
        return Object.assign({
          html: `${BOX} ${OP('−')} ${cm(b)} ${OP('=')} ${cm(ans)}`, equals: false,
          key: `mn2-${b}-${ans}`,
        }, numAns(ans + b));
      }
      if (form === 3) { // a − □ = c
        const a = R(20, scale + 20), ans = R(5, Math.max(6, a - 5));
        return Object.assign({
          html: `${cm(a)} ${OP('−')} ${BOX} ${OP('=')} ${cm(a - ans)}`, equals: false,
          key: `mn3-${a}-${ans}`,
        }, numAns(ans));
      }
      if (form === 4) { // □ × b = c
        const b = c.pw <= 2 ? pick([2, 3, 4, 5, 10]) : R(3, 12);
        const ans = c.pw <= 2 ? R(2, 12) : R(4, 60);
        return Object.assign({
          html: `${BOX} ${OP('×')} ${b} ${OP('=')} ${cm(ans * b)}`, equals: false,
          key: `mn4-${b}-${ans}`,
        }, numAns(ans));
      }
      const b = c.pw <= 2 ? pick([2, 3, 4, 5, 10]) : R(3, 12); // □ ÷ b = c
      const ans = c.pw <= 2 ? R(2, 12) : R(4, 60);
      return Object.assign({
        html: `${BOX} ${OP('÷')} ${b} ${OP('=')} ${cm(ans)}`, equals: false,
        key: `mn5-${b}-${ans}`,
      }, numAns(ans * b));
    },
  });

  topic({
    id: 'bidmas', label: 'Order of operations (BIDMAS)', group: 'Reasoning & algebra',
    years: [5, 6],
    blurb: 'Multi-step calculations where operation order decides the answer.',
    gen(c) {
      const mode = c.pw >= 5 ? R(0, 4) : R(0, 2);
      if (mode === 0) { // a + b ÷ c
        const cq = R(2, 9), q = R(2, 12), a = R(5, 60);
        return Object.assign({
          html: `${a} ${OP('+')} ${cq * q} ${OP('÷')} ${cq}`,
          key: `bid0-${a}-${cq * q}-${cq}`,
        }, numAns(a + q));
      }
      if (mode === 1) { // a − b × c
        const b = R(2, 9), cc = R(2, 9), a = R(b * cc + 1, b * cc + 60);
        return Object.assign({
          html: `${a} ${OP('−')} ${b} ${OP('×')} ${cc}`,
          key: `bid1-${a}-${b}-${cc}`,
        }, numAns(a - b * cc));
      }
      if (mode === 2) { // (a + b) × c
        const a = R(2, 20), b = R(2, 20), cc = R(2, 9);
        return Object.assign({
          html: `(${a} ${OP('+')} ${b}) ${OP('×')} ${cc}`,
          key: `bid2-${a}-${b}-${cc}`,
        }, numAns((a + b) * cc));
      }
      if (mode === 3) { // a + b² ÷ c
        const b = R(2, 9), cc = pick([2, 4, R(2, 6)]);
        const a = R(3, 40);
        const val = a + (b * b) / cc;
        if (!Number.isInteger(val)) {
          const cc2 = 1;
          return Object.assign({
            html: `${a} ${OP('+')} ${b}<sup>2</sup> ${OP('÷')} ${cc2}`,
            key: `bid3-${a}-${b}-${cc2}`,
          }, numAns(a + b * b));
        }
        return Object.assign({
          html: `${a} ${OP('+')} ${b}<sup>2</sup> ${OP('÷')} ${cc}`,
          key: `bid3-${a}-${b}-${cc}`,
        }, numAns(val));
      }
      // (a + b) ÷ c × d
      const cc = R(2, 9), q = R(2, 9), d = R(2, 9);
      const total = cc * q, a = R(1, total - 1), b = total - a;
      return Object.assign({
        html: `(${a} ${OP('+')} ${b}) ${OP('÷')} ${cc} ${OP('×')} ${d}`,
        key: `bid4-${a}-${b}-${cc}-${d}`,
      }, numAns(q * d));
    },
  });

  topic({
    id: 'algebra', label: 'Simple algebra', group: 'Reasoning & algebra',
    years: [5, 6],
    blurb: 'Solving one- and two-step linear equations for a missing variable.',
    gen(c) {
      const v = pick(['x', 'n', 'a', 'y']);
      if (c.pw >= 6 && coin(0.4)) { // ax + b = cx + d   (unknown on both sides)
        const a = R(4, 9), cc = R(2, a - 1), x = R(2, 12), b = R(1, 20);
        const d = (a - cc) * x + b;
        return Object.assign({
          html: `<span class="q-prompt">${a}${v} ${OP('+')} ${b} ${OP('=')} ${cc}${v} ${OP('+')} ${d}, &nbsp;${v}</span>`,
          equals: true,
          key: `alg2-${a}-${b}-${cc}-${x}`,
        }, numAns(x));
      }
      if (coin(0.5)) { // ax + b = c
        const a = R(2, 9), x = R(2, 12), b = R(1, 30);
        return Object.assign({
          html: `<span class="q-prompt">${a}${v} ${OP('+')} ${b} ${OP('=')} ${a * x + b}, &nbsp;${v}</span>`,
          equals: true,
          key: `alg0-${a}-${b}-${x}`,
        }, numAns(x));
      }
      const a = R(2, 9), x = R(2, 12), b = R(1, 30); // ax − b = c
      return Object.assign({
        html: `<span class="q-prompt">${a}${v} ${OP('−')} ${b} ${OP('=')} ${a * x - b}, &nbsp;${v}</span>`,
        equals: true,
        key: `alg1-${a}-${b}-${x}`,
      }, numAns(x));
    },
  });

  topic({
    id: 'negatives', label: 'Negative numbers', group: 'Reasoning & algebra',
    years: [4, 5, 6],
    blurb: 'Calculating across zero, including subtracting a negative.',
    gen(c) {
      const mag = c.pw <= 3 ? 12 : 30;
      const mode = c.pw >= 5 ? R(0, 2) : R(0, 1);
      if (mode === 0) {
        const a = -R(1, mag), b = R(1, mag * 2);
        return Object.assign({
          html: `${cm(a)} ${OP('+')} ${b}`,
          key: `neg0-${a}-${b}`,
        }, numAns(a + b));
      }
      if (mode === 1) {
        const a = R(1, mag), b = R(a + 1, a + mag);
        return Object.assign({
          html: `${a} ${OP('−')} ${b}`,
          key: `neg1-${a}-${b}`,
        }, numAns(a - b));
      }
      const a = -R(1, mag), b = -R(1, mag);
      return Object.assign({
        html: `${cm(a)} ${OP('−')} (${cm(b)})`,
        key: `neg2-${a}-${b}`,
      }, numAns(a - b));
    },
  });

  topic({
    id: 'squares-roots', label: 'Squares, cubes & roots', group: 'Reasoning & algebra',
    years: [5, 6],
    blurb: 'Square and cube numbers plus the inverse — square roots.',
    gen(c) {
      const mode = R(0, 2);
      if (mode === 0) {
        const n = R(2, c.pw <= 4 ? 12 : 20);
        return Object.assign({
          html: `${n}<sup>2</sup>`,
          key: `sq-${n}`,
        }, numAns(n * n));
      }
      if (mode === 1) {
        const n = R(2, c.pw <= 4 ? 6 : 10);
        return Object.assign({
          html: `${n}<sup>3</sup>`,
          key: `cu-${n}`,
        }, numAns(n * n * n));
      }
      const n = R(2, c.pw <= 4 ? 12 : 20);
      return Object.assign({
        html: `√${n * n}`,
        key: `rt-${n}`,
      }, numAns(n));
    },
  });

  topic({
    id: 'ratio', label: 'Ratio & proportion', group: 'Reasoning & algebra',
    years: [6],
    blurb: 'Simplifying ratios and sharing amounts in a given ratio.',
    gen() {
      if (coin()) {
        const a = R(2, 9), b = R(2, 9), k = R(2, 12);
        const [sa, sb] = [a / gcd(a, b), b / gcd(a, b)];
        return {
          html: `<span class="q-prompt">Simplify ${a * k} : ${b * k}</span>`, equals: false,
          type: 'ratio', value: sa / sb, ratio: [sa, sb],
          ansHtml: `${sa} : ${sb}`, ansText: `${sa} : ${sb}`,
          wide: true, placeholder: '… : …',
          key: `rat-${a * k}-${b * k}`,
        };
      }
      const a = R(1, 7), b = R(1, 7), unit = R(3, 30);
      const total = (a + b) * unit;
      const which = coin();
      return Object.assign({
        html: `<span class="q-prompt">Share ${cm(total)} in ratio ${a} : ${b}, ${which ? 'larger' : 'smaller'} share</span>`,
        equals: false,
        key: `rsh-${total}-${a}-${b}-${which}`,
      }, numAns((which ? Math.max(a, b) : Math.min(a, b)) * unit));
    },
  });

  /* ---------- GROUP: Measurement ---------- */

  topic({
    id: 'measures', label: 'Converting units', group: 'Measurement',
    years: [3, 4, 5, 6],
    blurb: 'Metric conversions between mm, cm, m, km, g, kg, ml and litres.',
    gen(c) {
      const sets = [
        { from: 'cm', to: 'mm', f: 10 }, { from: 'm', to: 'cm', f: 100 },
        { from: 'km', to: 'm', f: 1000 }, { from: 'kg', to: 'g', f: 1000 },
        { from: 'litres', to: 'ml', f: 1000 }, { from: 'm', to: 'mm', f: 1000 },
      ];
      const s = pick(sets);
      const useDecimal = c.pw >= 3 && coin(0.6);
      const n = useDecimal ? clean(Number((R(1, 90) / 10).toFixed(1))) : R(2, 90);
      if (coin(0.55)) {
        return Object.assign({
          html: `<span class="q-prompt">${n} ${s.from} = ${BOX} ${s.to}</span>`, equals: false,
          key: `mes-${n}-${s.from}-${s.to}`, wide: true,
        }, numAns(n * s.f));
      }
      const big = clean(n * s.f);
      return Object.assign({
        html: `<span class="q-prompt">${cm(big)} ${s.to} = ${BOX} ${s.from}</span>`, equals: false,
        key: `mes2-${big}-${s.to}-${s.from}`, wide: true,
      }, numAns(n));
    },
  });

  topic({
    id: 'area-perimeter', label: 'Area & perimeter', group: 'Measurement',
    years: [4, 5, 6],
    blurb: 'Area and perimeter of rectangles, triangles and compound shapes.',
    gen(c) {
      const w = R(3, c.pw <= 3 ? 12 : 40), h = R(3, c.pw <= 3 ? 12 : 40);
      const mode = c.pw >= 4 ? R(0, 2) : R(0, 1);
      if (mode === 0) {
        return Object.assign({
          html: `<span class="q-prompt">Area: rectangle ${w} cm × ${h} cm</span>`, equals: false,
          suffix: 'cm²', key: `area-${w}-${h}`,
        }, numAns(w * h));
      }
      if (mode === 1) {
        return Object.assign({
          html: `<span class="q-prompt">Perimeter: rectangle ${w} cm × ${h} cm</span>`, equals: false,
          suffix: 'cm', key: `peri-${w}-${h}`,
        }, numAns(2 * (w + h)));
      }
      const base = R(2, 20) * 2;
      return Object.assign({
        html: `<span class="q-prompt">Area: triangle, base ${base} cm, height ${h} cm</span>`, equals: false,
        suffix: 'cm²', key: `tri-${base}-${h}`,
      }, numAns(base * h / 2));
    },
  });

  topic({
    id: 'sequences', label: 'Number sequences', group: 'Reasoning & algebra',
    years: [2, 3, 4, 5, 6],
    blurb: 'Spotting the rule and continuing linear sequences, forwards and back.',
    gen(c) {
      const step = c.pw <= 1 ? pick([2, 5, 10]) : c.pw <= 3 ? R(3, 12) : R(4, 25);
      const down = c.pw >= 3 && coin(0.4);
      const start = down ? R(step * 5, step * 14) : R(1, c.pw <= 2 ? 20 : 120);
      const terms = [];
      for (let i = 0; i < 4; i++) terms.push(down ? start - i * step : start + i * step);
      const next = down ? start - 4 * step : start + 4 * step;
      return Object.assign({
        html: `<span class="q-prompt">${terms.map(cm).join(', ')}, ${BOX}</span>`, equals: false,
        key: `seq-${start}-${step}-${down}`,
      }, numAns(next));
    },
  });

  /* ==================================================================
     Registry helpers
     ================================================================== */
  const BY_ID = {};
  TOPICS.forEach((t) => { BY_ID[t.id] = t; });

  const GROUP_ORDER = [
    'Mental arithmetic',
    'Number & place value',
    'Written methods',
    'Fractions',
    'Decimals & percentages',
    'Reasoning & algebra',
    'Measurement',
  ];

  function topicsForYear(year) {
    return TOPICS.filter((t) => t.years.indexOf(Number(year)) !== -1);
  }

  function groupedTopicsForYear(year) {
    const list = topicsForYear(year);
    return GROUP_ORDER
      .map((g) => ({ group: g, topics: list.filter((t) => t.group === g) }))
      .filter((g) => g.topics.length);
  }

  const LEVEL_INDEX = { easy: 0, medium: 1, hard: 2 };

  /* ==================================================================
     Sheet builder
     ================================================================== */
  function buildSheet(opts) {
    const year = clamp(Number(opts.year) || 5, 2, 6);
    const level = LEVEL_INDEX[opts.level] === undefined ? 'medium' : opts.level;
    const count = clamp(Number(opts.count) || 36, 4, 120);
    const pw = clamp((year - 2) + LEVEL_INDEX[level], 0, 6);

    let active = topicsForYear(year);
    if (Array.isArray(opts.topics) && opts.topics.length) {
      const allow = new Set(opts.topics);
      const filtered = active.filter((t) => allow.has(t.id));
      if (filtered.length) active = filtered;
    }
    if (!active.length) active = topicsForYear(year);

    const ctx = { year, level, pw };
    const questions = [];
    const seen = new Set();

    // Round-robin through a shuffled topic list so every enabled topic
    // appears before any topic repeats — maximum variety per sheet.
    let bag = shuffle(active);
    let bagIndex = 0;
    let guard = 0;

    while (questions.length < count && guard < count * 60) {
      guard++;
      if (bagIndex >= bag.length) { bag = shuffle(active); bagIndex = 0; }
      const t = bag[bagIndex++];
      let q;
      try { q = t.gen(ctx); } catch (err) { continue; }
      if (!q || !q.html) continue;
      const key = t.id + ':' + (q.key || q.html);
      if (seen.has(key)) { bagIndex--; continue; }
      seen.add(key);
      questions.push(Object.assign({
        topic: t.id,
        topicLabel: t.label,
        group: t.group,
        equals: true,
        type: 'number',
        wide: false,
      }, q));
    }

    return {
      year, level, count: questions.length,
      generatedAt: new Date().toISOString(),
      questions,
    };
  }

  /* ==================================================================
     Answer parsing & marking
     ================================================================== */
  function parseUser(raw) {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim().toLowerCase();
    if (!s) return null;

    // Normalise unicode minus / fancy slashes / stray units
    s = s.replace(/[−–—]/g, '-')
         .replace(/[÷⁄]/g, '/')
         .replace(/,/g, '')
         .replace(/\s*(£|\$|%|cm2|cm²|cm|mm|kg|km|ml|g|m|l)\b\.?/g, '')
         .replace(/\s+/g, ' ')
         .trim();
    if (!s) return null;

    let m;
    if ((m = s.match(/^(-?\d+)\s*(?:r|rem|remainder|rm)\s*\.?\s*(\d+)$/))) {
      return { kind: 'remainder', q: Number(m[1]), r: Number(m[2]) };
    }
    if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/))) {
      return { kind: 'ratio', a: Number(m[1]), b: Number(m[2]) };
    }
    if ((m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
      const w = Number(m[1]), n = Number(m[2]), d = Number(m[3]);
      if (!d) return { kind: 'bad' };
      const sign = w < 0 ? -1 : 1;
      return { kind: 'number', value: w + sign * (n / d) };
    }
    if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/))) {
      const n = Number(m[1]), d = Number(m[2]);
      if (!d) return { kind: 'bad' };
      return { kind: 'number', value: n / d, frac: [n, d] };
    }
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) {
      return { kind: 'number', value: Number(s) };
    }
    return { kind: 'text', text: s };
  }

  const EPS = 1e-9;

  function isCorrect(q, raw) {
    const u = parseUser(raw);
    if (!u || u.kind === 'bad') return false;

    if (q.type === 'remainder') {
      if (u.kind === 'remainder') return u.q === q.rem.q && u.r === q.rem.r;
      // A decimal/fraction equivalent is also mathematically true
      if (u.kind === 'number') return Math.abs(u.value - q.value) < 1e-6;
      return false;
    }

    if (q.type === 'ratio') {
      if (u.kind === 'ratio') {
        const [a, b] = q.ratio;
        return Math.abs(u.a * b - u.b * a) < EPS && u.a > 0 && u.b > 0;
      }
      return false;
    }

    if (u.kind !== 'number') return false;
    const target = q.value;
    const tol = Math.max(EPS, Math.abs(target) * 1e-9);
    return Math.abs(u.value - target) <= tol;
  }

  /* ==================================================================
     TIMES TABLES ENGINE
     ------------------------------------------------------------------
     Separate from the curriculum topic library because the teacher is
     choosing the exact facts, not a year group. Any table from 1 to 100,
     any multiplier range, and four question shapes:

       multiply        7 × 8 = □
       divide          56 ÷ 8 = □
       missing factor  7 × □ = 56
       missing dividend □ ÷ 8 = 7

     Returns the same question objects buildSheet() produces, so the
     worksheet renderer, marker, answer key and printer need no changes.
     ================================================================== */

  const TABLE_SHAPES = ['mul', 'div', 'missing'];

  function tablesQuestion(table, multiplier, shape, order) {
    const product = table * multiplier;
    // "order" flips which operand leads, so the sheet is not 36 rows of "7 × n".
    const a = order ? table : multiplier;
    const b = order ? multiplier : table;

    if (shape === 'div') {
      return Object.assign({
        html: `${cm(product)} ${OP('÷')} ${cm(table)}`,
        key: `tdiv-${product}-${table}`,
        topic: 'tables-div', topicLabel: 'Division fact', group: 'Times tables',
      }, numAns(multiplier));
    }

    if (shape === 'missing') {
      // alternate between a missing factor and a missing dividend
      if (multiplier % 2 === 0) {
        return Object.assign({
          html: `${cm(a)} ${OP('×')} ${BOX} ${OP('=')} ${cm(product)}`,
          key: `tmisf-${a}-${product}`, equals: false,
          topic: 'tables-missing', topicLabel: 'Missing number', group: 'Times tables',
        }, numAns(b));
      }
      return Object.assign({
        html: `${BOX} ${OP('÷')} ${cm(table)} ${OP('=')} ${cm(multiplier)}`,
        key: `tmisd-${table}-${multiplier}`, equals: false,
        topic: 'tables-missing', topicLabel: 'Missing number', group: 'Times tables',
      }, numAns(product));
    }

    return Object.assign({
      html: `${cm(a)} ${OP('×')} ${cm(b)}`,
      key: `tmul-${a}-${b}`,
      topic: 'tables-mul', topicLabel: 'Multiplication fact', group: 'Times tables',
    }, numAns(product));
  }

  /**
   * @param {object} o
   * @param {number[]} o.tables       which tables to drill, 1–100
   * @param {string}   o.ops          'mul' | 'div' | 'both' | 'missing' | 'all'
   * @param {number}   o.min          lowest multiplier (1–100)
   * @param {number}   o.max          highest multiplier (1–100)
   * @param {number}   o.count        how many questions
   * @param {boolean}  o.inOrder      walk the tables in order instead of shuffling
   */
  function buildTablesSheet(o) {
    const opts = o || {};
    let tables = (Array.isArray(opts.tables) ? opts.tables : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100);
    tables = Array.from(new Set(tables)).sort((x, y) => x - y);
    if (!tables.length) tables = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    let min = clamp(Math.round(Number(opts.min) || 1), 0, 100);
    let max = clamp(Math.round(Number(opts.max) || 12), 0, 100);
    if (max < min) { const t = min; min = max; max = t; }

    const count = clamp(Number(opts.count) || 36, 4, 120);
    const inOrder = !!opts.inOrder;

    const ops = opts.ops || 'mul';
    const shapes = ops === 'all' ? ['mul', 'div', 'missing']
      : ops === 'both' ? ['mul', 'div']
        : TABLE_SHAPES.indexOf(ops) !== -1 ? [ops] : ['mul'];

    // Every legal (table, multiplier, shape) combination, then sample from it.
    // Dividing by zero is not a times-table fact, so skip table 0 / multiplier 0
    // for the division and missing-dividend shapes.
    const pool = [];
    tables.forEach(function (t) {
      for (let m = min; m <= max; m++) {
        shapes.forEach(function (shape) {
          if ((shape === 'div' || shape === 'missing') && (t === 0 || m === 0)) return;
          pool.push([t, m, shape]);
        });
      }
    });
    if (!pool.length) pool.push([2, 1, 'mul']);

    let picked;
    if (inOrder) {
      picked = [];
      for (let i = 0; i < count; i++) picked.push(pool[i % pool.length]);
    } else {
      picked = shuffle(pool).slice(0, count);
      // Not enough distinct facts for the requested count? Top up, still shuffled.
      while (picked.length < count) {
        picked = picked.concat(shuffle(pool).slice(0, count - picked.length));
      }
    }

    const questions = picked.map(function (p, i) {
      return Object.assign({
        equals: true, type: 'number', wide: false,
      }, tablesQuestion(p[0], p[1], p[2], inOrder ? true : (i % 2 === 0)));
    });

    return {
      mode: 'tables',
      tables: tables, ops: ops, min: min, max: max,
      count: questions.length,
      poolSize: pool.length,
      questions: questions,
    };
  }

  /* ==================================================================
     Public API
     ================================================================== */
  global.MathIt = global.MathIt || {};
  global.MathIt.Generator = {
    TOPICS, BY_ID, GROUP_ORDER,
    topicsForYear, groupedTopicsForYear,
    buildSheet, buildTablesSheet, isCorrect, parseUser,
    helpers: { R, pick, shuffle, gcd, lcm, simplify, clean, cm, fracHtml, mixedHtml },
  };
})(window);
