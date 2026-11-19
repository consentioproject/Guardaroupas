import * as auth from './auth.js';
import * as db from './db.js';
import { $, h } from './dom.js';
import { showLogin } from './login.js';
import { CATEGORIES, COLORS, OCCASIONS, WARMTH, catById, colorById, occById } from './catalog.js';
import { detectColor, resizeImage } from './colors.js';
import { alternatives, describeTemp, evaluate, suggest } from './outfit.js';
import { MANUAL_TEMPS, getWeather } from './weather.js';

/* ---------- utilidades ---------- */

let currentUser = null; // null no modo local (sem login)

const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem('gr.' + key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('gr.' + key, value);
    } catch {}
  },
};

const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, fuso local

let toastTimer;
function toast(msg) {
  $('.toast')?.remove();
  document.body.append(h('div', { class: 'toast', role: 'status' }, msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('.toast')?.remove(), 2400);
}

/* ---------- estado ---------- */

const S = {
  tab: 'today',
  items: [],
  wears: [],
  filter: 'all',
  occasion: store.get('occasion', 'casual'),
  wmode: store.get('wmode', 'auto'), // auto | frio | fresco | ameno | calor
  rain: false,
  weather: null,
  weatherFailed: false,
  loadingWeather: false,
  outfit: null,
  shown: new Set(),
  swapCursor: {},
};

const urls = new Map();
function urlFor(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.photo));
  return urls.get(item.id);
}
function forgetUrl(id) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}

const itemName = (it) => it.name || catById(it.category).label;

async function load() {
  [S.items, S.wears] = await Promise.all([db.getAll('items'), db.getAll('wears')]);
  S.items.sort((a, b) => b.createdAt - a.createdAt);
  S.wears.sort((a, b) => b.ts - a.ts);
}

/* ---------- clima e sugestão ---------- */

function ctx() {
  const w = S.weather ?? { temp: 22, rain: 0 };
  return { items: S.items, wears: S.wears, occasion: S.occasion, temp: w.temp, rain: w.rain };
}

async function resolveWeather() {
  S.weatherFailed = false;
  if (S.wmode === 'auto') {
    S.loadingWeather = true;
    render();
    try {
      S.weather = await getWeather();
    } catch {
      S.weather = { temp: 22, rain: 0, fallback: true };
      S.weatherFailed = true;
    }
    S.loadingWeather = false;
  } else {
    S.weather = { temp: MANUAL_TEMPS[S.wmode], rain: S.rain ? 80 : 0, manual: true };
  }
}

function newOutfit() {
  S.swapCursor = {};
  if (!S.items.length) {
    S.outfit = null;
    return;
  }
  S.outfit = suggest({ ...ctx(), exclude: S.shown });
  if (S.outfit.ok) S.shown.add(S.outfit.signature);
}

async function refresh({ weather = false } = {}) {
  if (weather || !S.weather) await resolveWeather();
  S.shown.clear();
  newOutfit();
  render();
}

/* ---------- navegação / render ---------- */

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const views = { today: viewToday, closet: viewCloset, history: viewHistory };
  $('#view').replaceChildren(views[S.tab]());
}

function chips(options, isOn, onPick, extra = '') {
  return h(
    'div',
    { class: 'chips ' + extra },
    options.map((o) =>
      h('button', { class: 'chip', 'aria-pressed': String(isOn(o)), onClick: () => onPick(o) }, o.label),
    ),
  );
}

function empty(title, text, cta, onClick) {
  return h('div', { class: 'empty' }, h('h2', {}, title), h('p', {}, text),
    cta && h('button', { class: 'btn primary', onClick }, cta));
}

/* ---------- aba Hoje ---------- */

const WMODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'frio', label: 'Frio' },
  { id: 'fresco', label: 'Fresco' },
  { id: 'ameno', label: 'Ameno' },
  { id: 'calor', label: 'Calor' },
];

function viewToday() {
  const root = h('section', {});
  if (!S.items.length) {
    return empty(
      'Seu armário está vazio',
      'Tire fotos das suas roupas e eu monto looks para o seu dia.',
      'Adicionar primeira peça',
      openAddChooser,
    );
  }

  const w = S.weather;
  root.append(
    h('div', { class: 'weather' },
      w && h('strong', {}, `${Math.round(w.temp)}°C`),
      h('span', {}, S.loadingWeather ? 'Buscando a previsão…' : w ? describeTemp(w.temp) + (w.max != null ? ` · máx ${Math.round(w.max)}° / mín ${Math.round(w.min)}°` : '') : ''),
    ),
    chips(WMODES, (m) => m.id === S.wmode, (m) => {
      S.wmode = m.id;
      store.set('wmode', m.id);
      S.weather = null;
      refresh({ weather: true });
    }, 'scroll'),
  );
  if (S.wmode !== 'auto') {
    root.append(
      h('div', { class: 'chips' },
        h('button', { class: 'chip', 'aria-pressed': String(S.rain), onClick: () => {
          S.rain = !S.rain;
          refresh({ weather: true });
        } }, '☔ Vai chover')),
    );
  }
  if (S.weatherFailed) {
    root.append(h('p', { class: 'hint' }, 'Não consegui a previsão (localização negada ou sem internet). Escolha o clima acima.'));
  }
  root.append(
    h('span', { class: 'label' }, 'Ocasião'),
    chips(OCCASIONS, (o) => o.id === S.occasion, (o) => {
      S.occasion = o.id;
      store.set('occasion', o.id);
      S.shown.clear();
      newOutfit();
      render();
    }, 'scroll'),
  );

  const o = S.outfit;
  if (S.loadingWeather || !o) return root;
  if (!o.ok) {
    root.append(empty('Ainda faltam peças', `Para montar um look, adicione ${o.missing} (ou um vestido).`, 'Adicionar peça', openAddChooser));
    return root;
  }

  const ORDER = ['outer', 'dress', 'top', 'bottom', 'shoes', 'accessory'];
  root.append(
    h('div', { class: 'outfit-card' },
      h('div', { class: 'tiles' },
        ORDER.filter((s) => o.slots[s]).map((slot) => {
          const it = o.slots[slot];
          return h('button', { class: 'tile', 'aria-label': `Trocar ${catById(slot).label}`, onClick: () => swap(slot) },
            h('img', { src: urlFor(it), alt: itemName(it) }),
            h('span', { class: 'tag' }, it.name || catById(slot).label),
            h('span', { class: 'swap', 'aria-hidden': 'true' }, '⟳'));
        })),
      h('ul', { class: 'reasons' }, o.reasons.map((r) => h('li', {}, r))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: () => { newOutfit(); render(); } }, 'Outra sugestão'),
        h('button', { class: 'btn primary', onClick: wearToday }, 'Vou usar hoje')),
    ),
    h('p', { class: 'hint' }, 'Toque numa peça para trocar só ela.'),
  );
  return root;
}

function swap(slot) {
  const o = S.outfit;
  const list = alternatives(ctx(), o.slots, slot);
  if (!list.length) return toast(`Não há outra peça de “${catById(slot).label}”`);
  const i = (S.swapCursor[slot] ?? -1) + 1;
  S.swapCursor[slot] = i % list.length;
  S.outfit = evaluate({ ...o.slots, [slot]: list[i % list.length] }, ctx());
  S.shown.add(S.outfit.signature);
  render();
}

async function wearToday() {
  const o = S.outfit;
  const wear = {
    id: db.uid(),
    date: todayStr(),
    ts: Date.now(),
    itemIds: Object.values(o.slots).filter(Boolean).map((p) => p.id),
    occasion: S.occasion,
  };
  await db.put('wears', wear);
  S.wears.unshift(wear);
  toast('Look salvo no histórico ✓');
}

/* ---------- aba Armário ---------- */

function viewCloset() {
  if (!S.items.length) {
    return empty('Nada por aqui ainda', 'Adicione fotos das suas peças com o botão ＋.', 'Adicionar peça', openAddChooser);
  }
  const count = (id) => S.items.filter((i) => id === 'all' || i.category === id).length;
  const filters = [{ id: 'all', label: 'Tudo' }, ...CATEGORIES].filter((f) => f.id === 'all' || count(f.id));
  const shown = S.items.filter((i) => S.filter === 'all' || i.category === S.filter);
  return h('section', {},
    chips(filters.map((f) => ({ ...f, label: `${f.label} ${count(f.id)}` })), (f) => f.id === S.filter,
      (f) => { S.filter = f.id; render(); }, 'scroll'),
    h('div', { class: 'grid' }, shown.map((it) => itemCard(it, () => edit(it)))),
  );
}

function itemCard(it, onClick) {
  return h('button', { class: 'card', 'aria-label': itemName(it), onClick },
    h('img', { src: urlFor(it), alt: itemName(it), loading: 'lazy' }),
    h('span', { class: 'dot', style: { background: colorById(it.color)?.hex } }),
    it.favorite && h('span', { class: 'star' }, '★'));
}

/* ---------- aba Histórico ---------- */

function viewHistory() {
  const root = h('section', {});
  const byId = new Map(S.items.map((i) => [i.id, i]));

  // peças paradas: nunca usadas ou há mais tempo sem uso
  const last = new Map();
  for (const w of S.wears) for (const id of w.itemIds) if (!last.has(id)) last.set(id, w.ts);
  const idle = [...S.items].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0)).slice(0, 8);
  if (S.items.length >= 3) {
    root.append(
      h('h2', { class: 'h2' }, 'Pedindo para sair do armário'),
      h('p', { class: 'hint' }, 'As peças que você usa há mais tempo (ou nunca usou).'),
      h('div', { class: 'row-scroll' }, idle.map((it) => itemCard(it, () => edit(it)))),
    );
  }

  root.append(h('h2', { class: 'h2' }, 'Looks usados'));
  if (!S.wears.length) {
    root.append(h('p', { class: 'hint' }, 'Quando tocar em “Vou usar hoje”, o look aparece aqui.'));
    return root;
  }
  for (const w of S.wears) {
    const pieces = w.itemIds.map((id) => byId.get(id)).filter(Boolean);
    const date = new Date(w.date + 'T12:00')
      .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/^./, (c) => c.toUpperCase());
    root.append(
      h('div', { class: 'day' },
        h('header', {},
          h('span', {}, h('b', {}, date), ` · ${occById(w.occasion)?.label ?? ''}`),
          h('button', { class: 'del', 'aria-label': 'Apagar registro', onClick: async () => {
            await db.remove('wears', w.id);
            S.wears = S.wears.filter((x) => x.id !== w.id);
            render();
          } }, '×')),
        h('div', { class: 'strip' }, pieces.map((it) => h('img', { src: urlFor(it), alt: itemName(it) })))),
    );
  }
  return root;
}

/* ---------- adicionar / editar peça ---------- */

function openAddChooser() {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(h('div', { class: 'body' },
    h('h2', {}, 'Adicionar peça'),
    h('p', { class: 'hint' }, 'Foto da peça inteira, de preferência sobre um fundo liso.'),
    h('div', { class: 'pick' },
      h('button', { class: 'btn primary', onClick: () => { close(); $('#cameraInput').click(); } }, '📷  Tirar foto'),
      h('button', { class: 'btn', onClick: () => { close(); $('#galleryInput').click(); } }, '🖼  Escolher da galeria (várias de uma vez)'),
      h('button', { class: 'btn', onClick: close }, 'Cancelar'))));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
}

async function addFiles(files) {
  const list = [...files];
  for (let i = 0; i < list.length; i++) {
    let img;
    try {
      img = await resizeImage(list[i]);
    } catch {
      toast('Não consegui abrir essa imagem');
      continue;
    }
    const draft = {
      id: db.uid(),
      name: '',
      category: S.tab === 'closet' && S.filter !== 'all' ? S.filter : 'top',
      color: detectColor(img.canvas),
      occasions: ['casual'],
      warmth: 2,
      favorite: false,
      photo: img.blob,
      createdAt: Date.now(),
    };
    const result = await openEditor(draft, { isNew: true, index: i + 1, total: list.length });
    if (result === 'stop') break;
  }
  await refresh();
}

async function edit(item) {
  await openEditor(item, { isNew: false });
  await refresh();
}

function openEditor(item, { isNew, index = 1, total = 1 }) {
  return new Promise((resolve) => {
    const d = { ...item, occasions: [...item.occasions] };
    const dlg = h('dialog', { class: 'sheet' });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      if (isNew && result !== 'saved') forgetUrl(d.id);
      resolve(result);
    };
    dlg.addEventListener('close', () => finish('stop'));

    const nameInput = h('input', {
      type: 'text', placeholder: 'Ex.: Camisa branca de linho (opcional)', maxlength: 60, value: d.name,
    });
    nameInput.addEventListener('input', () => { d.name = nameInput.value.trim(); });
    const options = h('div', {});
    const draw = () => {
      options.replaceChildren(
        h('span', { class: 'label' }, 'Tipo'),
        chips(CATEGORIES, (c) => c.id === d.category, (c) => { d.category = c.id; draw(); }),
        h('span', { class: 'label' }, 'Cor principal'),
        h('div', { class: 'swatches' }, COLORS.map((c) =>
          h('button', { class: 'swatch', title: c.label, 'aria-label': c.label, 'aria-pressed': String(c.id === d.color),
            style: { background: c.hex }, onClick: () => { d.color = c.id; draw(); } }))),
        h('p', { class: 'hint' }, `Cor: ${colorById(d.color).label}`),
        h('span', { class: 'label' }, 'Combina com (pode marcar várias)'),
        chips(OCCASIONS, (o) => d.occasions.includes(o.id), (o) => {
          d.occasions = d.occasions.includes(o.id) ? d.occasions.filter((x) => x !== o.id) : [...d.occasions, o.id];
          draw();
        }),
        h('span', { class: 'label' }, 'Espessura'),
        chips(WARMTH, (w) => w.id === d.warmth, (w) => { d.warmth = w.id; draw(); }),
        h('p', { class: 'hint' }, WARMTH.find((w) => w.id === d.warmth).hint),
      );
    };
    draw();

    const save = async () => {
      if (!d.occasions.length) d.occasions = ['casual'];
      await db.put('items', d);
      const i = S.items.findIndex((x) => x.id === d.id);
      if (i >= 0) S.items[i] = d; else S.items.unshift(d);
      finish('saved');
    };
    const del = async () => {
      if (!confirm('Excluir esta peça do armário?')) return;
      await db.remove('items', d.id);
      S.items = S.items.filter((x) => x.id !== d.id);
      forgetUrl(d.id);
      finish('deleted');
    };

    dlg.append(h('div', { class: 'body' },
      total > 1 && h('p', { class: 'progress' }, `Foto ${index} de ${total}`),
      h('img', { class: 'preview', src: urlFor(d), alt: 'Foto da peça' }),
      h('span', { class: 'label' }, 'Nome'),
      nameInput,
      options,
      h('div', { class: 'footer' },
        !isNew && h('button', { class: 'btn', onClick: () => { d.favorite = !d.favorite; save(); } }, d.favorite ? '★ Favorita' : '☆ Favoritar'),
        !isNew && h('button', { class: 'btn danger', onClick: del }, 'Excluir'),
        isNew && h('button', { class: 'btn', onClick: () => finish(total > 1 ? 'skip' : 'stop') }, total > 1 ? 'Pular' : 'Cancelar'),
        h('button', { class: 'btn primary', onClick: save }, 'Salvar')),
    ));
    document.body.append(dlg);
    dlg.showModal();
    document.activeElement?.blur(); // evita abrir o teclado no celular
  });
}

/* ---------- backup ---------- */

const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

async function exportBackup() {
  const items = await Promise.all(S.items.map(async (i) => ({ ...i, photo: await blobToDataURL(i.photo) })));
  const data = { app: 'guardaroupas', version: 1, exportedAt: new Date().toISOString(), items, wears: S.wears };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  h('a', { href: url, download: `guarda-roupa-${todayStr()}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'guardaroupas' || !Array.isArray(data.items)) throw new Error('formato');
    for (const it of data.items) {
      if (typeof it.id !== 'string' || !catById(it.category) || !colorById(it.color)) continue;
      it.photo = await (await fetch(it.photo)).blob();
      await db.put('items', it);
    }
    for (const w of data.wears ?? []) await db.put('wears', w);
    await load();
    await refresh();
    toast('Backup importado ✓');
  } catch {
    toast('Arquivo de backup inválido');
  }
}

function openMenu() {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => { dlg.close(); dlg.remove(); };
  const importInput = h('input', { type: 'file', accept: 'application/json', hidden: true });
  importInput.addEventListener('change', () => { if (importInput.files[0]) { close(); importBackup(importInput.files[0]); } });
  dlg.append(h('div', { class: 'body' },
    h('h2', {}, 'Seus dados'),
    currentUser && h('p', { class: 'hint' }, `Conectado como ${currentUser.email}`),
    h('p', { class: 'hint' }, 'Fotos e histórico ficam guardados só neste aparelho, dentro do navegador. Faça backup de vez em quando — limpar os dados do navegador apaga tudo.'),
    h('div', { class: 'pick' },
      h('button', { class: 'btn', onClick: () => { close(); exportBackup(); } }, '⬇️  Exportar backup'),
      h('button', { class: 'btn', onClick: () => importInput.click() }, '⬆️  Importar backup'),
      importInput,
      currentUser && h('button', { class: 'btn danger', onClick: async () => { await auth.signOut(); location.reload(); } }, 'Sair da conta'),
      h('button', { class: 'btn', onClick: close }, 'Fechar'))));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
}

/* ---------- início ---------- */

document.querySelectorAll('.tabbar button').forEach((b) =>
  b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); }));
$('#addBtn').addEventListener('click', openAddChooser);
$('#menuBtn').addEventListener('click', openMenu);
for (const id of ['#cameraInput', '#galleryInput']) {
  $(id).addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length) addFiles(files).finally(() => { e.target.value = ''; });
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Porta de entrada: com login configurado, ninguém vê o app sem entrar.
// Os dados locais ficam separados por usuário (vários contas no mesmo navegador).
if (auth.enabled) {
  auth.onEvent((event) => {
    if (event === 'SIGNED_OUT' && currentUser) location.reload();
    if (event === 'PASSWORD_RECOVERY') showLogin('recovery');
  }).catch(() => {});
  currentUser = await auth.init();
  if (!currentUser) currentUser = await showLogin();
  db.useNamespace(currentUser.id);
}

await load();
render();
if (S.items.length) await refresh({ weather: true });
