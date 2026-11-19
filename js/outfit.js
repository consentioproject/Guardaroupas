// Motor de sugestões: monta looks combinando ocasião, clima, harmonia de cores e
// o que você usou recentemente. Tudo local, sem IA externa.

import { colorById } from './catalog.js';

const BAD_NEUTRAL = new Set([
  'marrom+preto',
  'azul-marinho+preto',
  'azul-marinho+marrom',
  'azul-marinho+jeans',
]);

// 0..1: o quanto duas cores combinam.
export function colorCompat(a, b) {
  const A = colorById(a);
  const B = colorById(b);
  if (!A || !B) return 0.6;
  if (a === b) return A.neutral ? 0.75 : 0.55;
  if (A.neutral && B.neutral) return BAD_NEUTRAL.has([a, b].sort().join('+')) ? 0.4 : 0.9;
  if (A.neutral || B.neutral) return 0.92;
  let d = Math.abs(A.hue - B.hue);
  d = Math.min(d, 360 - d);
  if (d <= 45) return 0.78; // análogas
  if (d >= 150) return 0.72; // complementares
  return 0.25;
}

export function describeTemp(t) {
  if (t <= 14) return 'Frio';
  if (t <= 19) return 'Fresco';
  if (t <= 25) return 'Ameno';
  return 'Calor';
}

// Espessura ideal (1 leve .. 3 quente) para a temperatura.
function warmthTarget(t) {
  if (t <= 10) return 3;
  if (t <= 14) return 2.6;
  if (t <= 19) return 2;
  if (t <= 24) return 1.5;
  return 1;
}

const FRESH = [0, 0.25, 0.5, 0.7, 0.8, 0.9, 0.95];
const freshness = (days) => (days == null ? 1 : (FRESH[days] ?? 1));
const WARM_SLOTS = new Set(['top', 'bottom', 'dress', 'outer']);
const dayMs = 86400000;

function buildLastWorn(wears) {
  const map = new Map();
  const today = new Date(new Date().toLocaleDateString('sv-SE') + 'T12:00');
  for (const w of wears) {
    const days = Math.round((today - new Date(w.date + 'T12:00')) / dayMs);
    for (const id of w.itemIds) if (!map.has(id) || days < map.get(id)) map.set(id, days);
  }
  return map;
}

function itemScore(it, c) {
  const warm = WARM_SLOTS.has(it.category)
    ? Math.max(0, 1 - Math.abs(it.warmth - c.target) * 0.45)
    : 1;
  return 0.55 * warm + 0.45 * freshness(c.lastWorn.get(it.id)) + (it.favorite ? 0.08 : 0);
}

function colorScore(s) {
  const upper = s.dress || s.top;
  const lower = s.dress || s.bottom;
  const pairs = [];
  if (s.top && s.bottom) pairs.push([s.top, s.bottom]);
  if (s.shoes) pairs.push([s.shoes, lower]);
  if (s.outer) {
    pairs.push([s.outer, upper]);
    if (lower !== upper) pairs.push([s.outer, lower]);
  }
  if (s.accessory) {
    pairs.push([s.accessory, upper]);
    if (s.shoes) pairs.push([s.accessory, s.shoes]);
  }
  let score = pairs.length
    ? pairs.reduce((sum, [a, b]) => sum + colorCompat(a.color, b.color), 0) / pairs.length
    : 0.8;
  const colorful = new Set(
    Object.values(s)
      .filter(Boolean)
      .map((p) => p.color)
      .filter((id) => !colorById(id)?.neutral),
  );
  if (colorful.size > 2) score -= 0.3;
  return score;
}

function scoreOutfit(slots, c, noise = 0) {
  const pieces = Object.values(slots).filter(Boolean);
  const items = pieces.reduce((sum, p) => sum + itemScore(p, c), 0) / pieces.length;
  return 0.45 * items + 0.55 * colorScore(slots) + noise;
}

const signature = (slots) =>
  Object.values(slots)
    .filter(Boolean)
    .map((p) => p.id)
    .sort()
    .join('|');

function explain(slots, c) {
  const out = [];
  const pieces = Object.values(slots).filter(Boolean);
  out.push(
    `${describeTemp(c.temp)} (${Math.round(c.temp)}°C)${c.rain >= 50 ? ', com chance de chuva' : ''}`,
  );
  const colorful = [...new Set(pieces.map((p) => p.color))].filter(
    (id) => !colorById(id)?.neutral,
  );
  if (!colorful.length) out.push('Tons neutros: combinam entre si sem erro');
  else if (colorful.length === 1)
    out.push(`${colorById(colorful[0]).label} em destaque sobre uma base discreta`);
  else out.push('Cores que se complementam');
  if (slots.outer) out.push(c.rain >= 60 ? 'Casaco por causa da chuva' : 'Casaco para o friozinho');
  if (pieces.some((p) => (c.lastWorn.get(p.id) ?? Infinity) >= 14))
    out.push('Dá uma chance a uma peça pouco usada');
  if (c.relaxed) out.push('Nenhuma peça estava marcada para esta ocasião, então usei as que você tem');
  return out;
}

function buildResult(slots, c) {
  return {
    ok: true,
    slots,
    score: scoreOutfit(slots, c),
    reasons: explain(slots, c),
    signature: signature(slots),
  };
}

function context({ wears, temp, rain }) {
  return { temp, rain, target: warmthTarget(temp), lastWorn: buildLastWorn(wears) };
}

// Peças da categoria que servem à ocasião (ou todas, se nenhuma estiver marcada).
function poolFor(items, cat, occasion, forceAll = false) {
  const all = items.filter((i) => i.category === cat);
  const match = all.filter((i) => i.occasions?.includes(occasion));
  return forceAll || !match.length ? all : match;
}

function best(list, build, c) {
  let top = null;
  let topScore = -Infinity;
  for (const it of list) {
    const s = scoreOutfit(build(it), c, Math.random() * 0.1);
    if (s > topScore) {
      topScore = s;
      top = it;
    }
  }
  return top;
}

export function suggest({ items, wears, occasion, temp, rain, exclude = new Set() }) {
  const c = context({ wears, temp, rain });
  let pools = {
    top: items.filter((i) => i.category === 'top' && i.occasions?.includes(occasion)),
    bottom: items.filter((i) => i.category === 'bottom' && i.occasions?.includes(occasion)),
    dress: items.filter((i) => i.category === 'dress' && i.occasions?.includes(occasion)),
  };
  const hasBase = (p) => p.dress.length || (p.top.length && p.bottom.length);
  if (!hasBase(pools)) {
    pools = {
      top: items.filter((i) => i.category === 'top'),
      bottom: items.filter((i) => i.category === 'bottom'),
      dress: items.filter((i) => i.category === 'dress'),
    };
    c.relaxed = true;
  }
  if (!hasBase(pools)) {
    const missing = [];
    if (!pools.top.length) missing.push('uma peça de cima');
    if (!pools.bottom.length) missing.push('uma peça de baixo');
    return { ok: false, missing: missing.join(' e '), hasDress: false };
  }
  const shoes = poolFor(items, 'shoes', occasion);
  const outers = poolFor(items, 'outer', occasion);
  const accessories = poolFor(items, 'accessory', occasion);

  const needOuter = temp <= 16 || (rain >= 60 && temp <= 23);
  const wantOuter = needOuter || temp <= 19;

  const bases = [];
  for (const top of pools.top) for (const bottom of pools.bottom) bases.push({ top, bottom });
  for (const dress of pools.dress) bases.push({ dress });

  const candidates = [];
  for (const base of bases) {
    const slots = { ...base };
    if (wantOuter && outers.length) slots.outer = best(outers, (o) => ({ ...slots, outer: o }), c);
    if (shoes.length) slots.shoes = best(shoes, (s) => ({ ...slots, shoes: s }), c);
    if (accessories.length && Math.random() < 0.4) {
      const acc = best(accessories, (a) => ({ ...slots, accessory: a }), c);
      const fits = (other) => !other || colorCompat(acc.color, other.color) >= 0.7;
      if (fits(slots.dress || slots.top) && fits(slots.shoes)) slots.accessory = acc;
    }
    candidates.push({ slots, score: scoreOutfit(slots, c, Math.random() * 0.12) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const pick = candidates.find((x) => !exclude.has(signature(x.slots))) ?? candidates[0];
  return buildResult(pick.slots, c);
}

// Recalcula explicação/pontuação depois de o usuário trocar uma peça.
export function evaluate(slots, { wears, temp, rain }) {
  return buildResult(slots, context({ wears, temp, rain }));
}

// Outras peças da mesma categoria, da que combina melhor com o resto do look.
export function alternatives({ items, wears, occasion, temp, rain }, slots, slot) {
  const c = context({ wears, temp, rain });
  const current = slots[slot];
  return poolFor(items, slot, occasion)
    .concat(poolFor(items, slot, occasion, true))
    .filter((it, i, arr) => it.id !== current.id && arr.indexOf(it) === i)
    .map((it) => ({ it, s: scoreOutfit({ ...slots, [slot]: it }, c) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
}
