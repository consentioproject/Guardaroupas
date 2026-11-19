// Provador virtual: recebe a foto da pessoa + as fotos das peças e devolve a imagem
// gerada pelo Gemini. Roda como função serverless da Vercel (CommonJS, sem dependências).
//
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   GEMINI_API_KEY   chave da API do Gemini (obrigatória; use conta com faturamento)
//   APP_ACCESS_CODE  código de acesso do provador (obrigatório; sem ele ninguém usa)
//   GEMINI_MODEL     opcional; padrão gemini-nano-banana-2.1
//
// Nada é gravado: as imagens passam pela memória e seguem direto para o Gemini.

const crypto = require('node:crypto');

const MODEL = process.env.GEMINI_MODEL || 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';
const TIMEOUT_MS = 55_000;
const MAX_GARMENTS = 6;
const MAX_IMAGE_B64 = 1_400_000; // ~1 MB por imagem; o corpo total da Vercel é limitado a 4,5 MB
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

const GARMENT_LABEL = {
  top: 'upper-body garment (shirt, t-shirt, blouse, sweater)',
  bottom: 'lower-body garment (trousers, jeans, skirt, shorts)',
  dress: 'dress or jumpsuit (covers both upper and lower body)',
  outer: 'jacket or coat worn over the upper-body garment',
  shoes: 'pair of shoes',
  accessory: 'accessory (bag, hat, belt, scarf or similar)',
};

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function prompt(garments) {
  const list = garments
    .map((g, i) => `- Image ${i + 2}: ${GARMENT_LABEL[g.category] ?? 'clothing item'}`)
    .join('\n');
  return [
    'Image 1 is a full-body photo of a real person. The other images are individual clothing items:',
    list,
    '',
    'Edit image 1 so that the person is wearing ALL of these clothing items together as one coherent outfit,',
    'replacing whatever they currently wear on those body parts.',
    "Keep the person's face, hair, skin tone, body shape, pose and the background exactly as in image 1.",
    'Reproduce each garment faithfully: same color, pattern, cut and material as in its reference photo.',
    'Do not add clothing, logos or text that are not in the references.',
    'Output a single photorealistic full-body image with the same framing as image 1.',
  ].join('\n');
}

function validImage(img) {
  return (
    img && typeof img.data === 'string' && img.data.length > 100 &&
    img.data.length <= MAX_IMAGE_B64 && B64.test(img.data)
  );
}

// Aceita a resposta nos dois formatos documentados (atalho output_image ou lista de steps).
function extractImage(json) {
  if (json?.output_image?.data) return json.output_image.data;
  for (const step of json?.steps ?? []) {
    if (step?.type !== 'model_output') continue;
    for (const c of step.content ?? []) if (c?.type === 'image' && c.data) return c.data;
  }
  return null;
}

function extractText(json) {
  const parts = [];
  for (const step of json?.steps ?? [])
    for (const c of step?.content ?? []) if (c?.type === 'text' && c.text) parts.push(c.text);
  return parts.join(' ').slice(0, 300);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => res.status(status).json(body);

  if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

  const key = process.env.GEMINI_API_KEY;
  const code = process.env.APP_ACCESS_CODE;
  if (!key || !code) return send(503, { error: 'not_configured' });

  if (!safeEqual(req.headers['x-access-code'] ?? '', code)) return send(401, { error: 'unauthorized' });

  const { person, garments } = req.body ?? {};
  if (
    !validImage(person) || !Array.isArray(garments) || garments.length < 1 ||
    garments.length > MAX_GARMENTS || !garments.every(validImage)
  ) {
    return send(400, { error: 'invalid_request' });
  }

  const input = [
    { type: 'text', text: prompt(garments) },
    { type: 'image', mime_type: 'image/jpeg', data: person.data },
    ...garments.map((g) => ({ type: 'image', mime_type: 'image/jpeg', data: g.data })),
  ];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
        'Api-Revision': API_REVISION,
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        response_format: { type: 'image', mime_type: 'image/jpeg', image_size: '1K' },
      }),
    });
    const json = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = String(json?.error?.message ?? '').slice(0, 300);
      console.error('gemini_error', upstream.status, detail);
      return send(502, { error: 'upstream', status: upstream.status, detail });
    }
    const image = extractImage(json);
    if (!image) return send(422, { error: 'no_image', detail: extractText(json) });
    return send(200, { image, mime: 'image/jpeg', model: MODEL });
  } catch (err) {
    const timeout = err?.name === 'AbortError';
    console.error('tryon_failure', timeout ? 'timeout' : err?.message);
    return send(timeout ? 504 : 502, { error: timeout ? 'timeout' : 'upstream', detail: '' });
  } finally {
    clearTimeout(timer);
  }
};
