// Provador virtual com IA: monta o pedido (foto do corpo + peças do look), chama a
// função /api/tryon e mostra a imagem gerada.

import * as db from './db.js';
import { h, openSheet } from './dom.js';
import { catById } from './catalog.js';

const BODY_KEY = 'bodyPhoto';
const ls = {
  get(k) { try { return localStorage.getItem('gr.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('gr.' + k, v); } catch {} },
  del(k) { try { localStorage.removeItem('gr.' + k); } catch {} },
};

/* ---------- imagens ---------- */

async function toJpegBlob(blob, max, quality = 0.85) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}

const toBase64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    input.addEventListener('change', () => resolve(input.files[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}

/* ---------- etapas de diálogo ---------- */

// Resolve true/false.
function confirmSheet({ title, text, ok, cancel = 'Cancelar', extra }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v, close) => { answered = true; resolve(v); close(); };
    openSheet((close) => [
      h('h2', {}, title),
      ...[].concat(text).map((t) => h('p', { class: 'hint' }, t)),
      extra,
      h('div', { class: 'footer' },
        h('button', { class: 'btn', onClick: () => answer(false, close) }, cancel),
        h('button', { class: 'btn primary', onClick: () => answer(true, close) }, ok)),
    ], () => { if (!answered) resolve(false); });
  });
}

async function ensureConsent() {
  if (ls.get('aiConsent') === '1') return true;
  const ok = await confirmSheet({
    title: 'Enviar fotos para a IA?',
    text: [
      'Para mostrar o look em você, a foto do seu corpo e as fotos das peças são enviadas, por um servidor deste app, ao Gemini (Google). O servidor não guarda as imagens.',
      'O Google trata as imagens conforme os termos da API do Gemini. Use apenas fotos suas, ou que você tenha direito de usar.',
    ],
    ok: 'Concordo e continuar',
  });
  if (ok) ls.set('aiConsent', '1');
  return ok;
}

async function addBodyPhoto() {
  const go = await confirmSheet({
    title: 'Sua foto de corpo inteiro',
    text: [
      'Uma foto sua em pé, de corpo inteiro, de frente, com boa luz e fundo simples. Roupa justa ou clara ajuda a IA a trocar as peças.',
      'A foto fica só neste aparelho e só é enviada quando você pedir para provar um look.',
    ],
    ok: 'Escolher foto',
  });
  if (!go) return null;
  const file = await pickFile();
  if (!file) return null;
  try {
    const blob = await toJpegBlob(file, 1024);
    await db.setMeta(BODY_KEY, blob);
    return blob;
  } catch {
    return null;
  }
}

function askAccessCode(message) {
  return new Promise((resolve) => {
    let answered = false;
    const input = h('input', { type: 'password', placeholder: 'Código de acesso', autocomplete: 'off' });
    const submit = (close) => {
      const v = input.value.trim();
      if (!v) return input.focus();
      answered = true;
      resolve(v);
      close();
    };
    openSheet((close) => [
      h('h2', {}, 'Código de acesso'),
      h('p', { class: 'hint' }, message ?? 'O provador com IA tem custo por imagem, então é protegido por um código. Peça ao dono do app.'),
      h('label', { class: 'field' }, input),
      h('div', { class: 'footer' },
        h('button', { class: 'btn', onClick: close }, 'Cancelar'),
        h('button', { class: 'btn primary', onClick: () => submit(close) }, 'Continuar')),
    ], () => { if (!answered) resolve(null); });
  });
}

function errorMessage(status, body) {
  if (status === 503) return 'O provador ainda não foi configurado no servidor (faltam a chave do Gemini e o código de acesso).';
  if (status === 401) return 'Código de acesso incorreto.';
  if (status === 413) return 'As imagens ficaram grandes demais. Tente de novo com menos peças.';
  if (status === 504) return 'A IA demorou demais para responder. Tente de novo.';
  if (body?.error === 'no_image') return `A IA não devolveu uma imagem${body.detail ? ': ' + body.detail : '.'} Tente de novo ou troque alguma peça.`;
  if (body?.error === 'upstream') return `O Gemini recusou o pedido${body.status ? ` (erro ${body.status})` : ''}${body.detail ? ': ' + body.detail : '.'}`;
  return 'Não consegui falar com o provador. Verifique a internet e tente de novo.';
}

/* ---------- fluxo principal ---------- */

export async function startTryOn(slots) {
  if (!(await ensureConsent())) return;
  let body = await db.getMeta(BODY_KEY);
  body ??= await addBodyPhoto();
  if (!body) return;

  let code = ls.get('aiCode') ?? (await askAccessCode());
  if (!code) return;

  const pieces = Object.entries(slots).filter(([, it]) => it);
  const ctrl = new AbortController();
  const status = h('p', { class: 'hint' }, 'Vestindo você… costuma levar de 10 a 30 segundos.');
  const loading = openSheet((close) => [
    h('div', { class: 'loading' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), status),
    h('div', { class: 'footer' }, h('button', { class: 'btn', onClick: close }, 'Cancelar')),
  ], () => ctrl.abort());

  try {
    const payload = {
      person: { data: await toBase64(await toJpegBlob(body, 1024)) },
      garments: await Promise.all(pieces.map(async ([category, it]) => ({
        category,
        data: await toBase64(await toJpegBlob(it.photo, 768, 0.8)),
      }))),
    };
    const res = await fetch('/api/tryon', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-access-code': code },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.image) {
      if (res.status === 401) ls.del('aiCode');
      throw Object.assign(new Error('tryon'), { status: res.status, body: json });
    }
    ls.set('aiCode', code);
    loading.close();
    showResult(`data:${json.mime || 'image/jpeg'};base64,${json.image}`, slots);
  } catch (err) {
    if (ctrl.signal.aborted) return;
    loading.close();
    const retryCode = err.status === 401;
    const again = await confirmSheet({
      title: 'Não deu certo',
      text: errorMessage(err.status, err.body),
      ok: retryCode ? 'Digitar o código de novo' : 'Tentar de novo',
      cancel: 'Fechar',
    });
    if (!again) return;
    if (retryCode) {
      code = await askAccessCode('Código incorreto. Digite de novo.');
      if (!code) return;
      ls.set('aiCode', code);
    }
    return startTryOn(slots);
  }
}

function showResult(src, slots) {
  const names = Object.keys(slots).filter((k) => slots[k]).map((k) => catById(k).label.toLowerCase());
  openSheet((close) => [
    h('img', { class: 'preview result', src, alt: 'Você vestindo o look sugerido' }),
    h('p', { class: 'hint' }, `Imagem gerada por IA com: ${names.join(', ')}. Caimento e tecido podem diferir da peça real.`),
    h('div', { class: 'footer' },
      h('a', { class: 'btn', href: src, download: 'look.jpg', role: 'button' }, 'Salvar imagem'),
      h('button', { class: 'btn', onClick: () => { close(); startTryOn(slots); } }, 'Gerar de novo'),
      h('button', { class: 'btn primary', onClick: close }, 'Fechar')),
  ]);
}

/* ---------- gerenciar a foto do corpo (menu) ---------- */

export async function manageBodyPhoto() {
  const body = await db.getMeta(BODY_KEY);
  openSheet((close) => [
    h('h2', {}, 'Foto do corpo'),
    body
      ? h('img', { class: 'preview', src: URL.createObjectURL(body), alt: 'Sua foto de corpo inteiro' })
      : h('p', { class: 'hint' }, 'Você ainda não adicionou uma foto. Ela é usada só no provador com IA e fica só neste aparelho.'),
    h('div', { class: 'pick' },
      h('button', { class: 'btn primary', onClick: async () => { close(); await addBodyPhoto(); } }, body ? 'Trocar foto' : 'Adicionar foto'),
      body && h('button', { class: 'btn danger', onClick: async () => { await db.delMeta(BODY_KEY); close(); } }, 'Apagar foto'),
      ls.get('aiConsent') === '1' && h('button', { class: 'btn', onClick: () => { ls.del('aiConsent'); ls.del('aiCode'); close(); } }, 'Revogar consentimento e código'),
      h('button', { class: 'btn', onClick: close }, 'Fechar')),
  ]);
}
