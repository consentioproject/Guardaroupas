// Processamento de imagem: redimensionar a foto e sugerir a cor predominante da peça.

import { COLORS } from './catalog.js';

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const PALETTE = COLORS.map((c) => ({ id: c.id, rgb: hexToRgb(c.hex) }));

// Distância "redmean": aproxima a percepção humana melhor que RGB puro.
function nearestColor(r, g, b) {
  let best = PALETTE[0].id;
  let bestD = Infinity;
  for (const p of PALETTE) {
    const rm = (r + p.rgb[0]) / 2;
    const dr = r - p.rgb[0];
    const dg = g - p.rgb[1];
    const db = b - p.rgb[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

export async function resizeImage(file, max = 900, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { blob, canvas };
}

// Compara o centro da foto (a peça) com a borda (o fundo): a cor que domina o
// centro e não o fundo é a mais provável de ser a da roupa.
export function detectColor(canvas) {
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);

  const lo = Math.round(S * 0.2);
  const hi = Math.round(S * 0.8);
  const center = {};
  const border = {};
  let nCenter = 0;
  let nBorder = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (data[i + 3] < 128) continue;
      const id = nearestColor(data[i], data[i + 1], data[i + 2]);
      const inCenter = x >= lo && x < hi && y >= lo && y < hi;
      const inBorder = x < S * 0.1 || x >= S * 0.9 || y < S * 0.1 || y >= S * 0.9;
      if (inCenter) {
        center[id] = (center[id] || 0) + 1;
        nCenter++;
      } else if (inBorder) {
        border[id] = (border[id] || 0) + 1;
        nBorder++;
      }
    }
  }
  let best = 'preto';
  let bestScore = -Infinity;
  for (const id of Object.keys(center)) {
    const score = center[id] / nCenter - 0.6 * ((border[id] || 0) / Math.max(nBorder, 1));
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
