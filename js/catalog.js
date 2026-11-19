// Constantes do domínio: categorias, cores, ocasiões e espessura das peças.

export const CATEGORIES = [
  { id: 'top', label: 'Parte de cima', emoji: '👕' },
  { id: 'bottom', label: 'Parte de baixo', emoji: '👖' },
  { id: 'dress', label: 'Vestido / macacão', emoji: '👗' },
  { id: 'outer', label: 'Casaco / jaqueta', emoji: '🧥' },
  { id: 'shoes', label: 'Calçado', emoji: '👟' },
  { id: 'accessory', label: 'Acessório', emoji: '👜' },
];

// hue (0-360) só é usado nas cores não neutras, para avaliar harmonia.
export const COLORS = [
  { id: 'preto', label: 'Preto', hex: '#1a1a1a', neutral: true },
  { id: 'branco', label: 'Branco', hex: '#f4f4f2', neutral: true },
  { id: 'cinza', label: 'Cinza', hex: '#8c8c8c', neutral: true },
  { id: 'bege', label: 'Bege', hex: '#d6c2a1', neutral: true },
  { id: 'marrom', label: 'Marrom', hex: '#6b4a2e', neutral: true },
  { id: 'azul-marinho', label: 'Azul-marinho', hex: '#1d2a4a', neutral: true },
  { id: 'jeans', label: 'Jeans', hex: '#4d73a8', neutral: true },
  { id: 'azul', label: 'Azul', hex: '#2e6fe0', neutral: false, hue: 215 },
  { id: 'verde', label: 'Verde', hex: '#3f8f55', neutral: false, hue: 130 },
  { id: 'vermelho', label: 'Vermelho', hex: '#c92a2a', neutral: false, hue: 0 },
  { id: 'vinho', label: 'Vinho', hex: '#6d1f2e', neutral: false, hue: 350 },
  { id: 'rosa', label: 'Rosa', hex: '#ec8fb4', neutral: false, hue: 335 },
  { id: 'laranja', label: 'Laranja', hex: '#ee7d2a', neutral: false, hue: 28 },
  { id: 'amarelo', label: 'Amarelo', hex: '#f3c63a', neutral: false, hue: 50 },
  { id: 'roxo', label: 'Roxo', hex: '#7a55c4', neutral: false, hue: 270 },
];

export const OCCASIONS = [
  { id: 'casual', label: 'Casual' },
  { id: 'trabalho', label: 'Trabalho' },
  { id: 'esporte', label: 'Esporte' },
  { id: 'festa', label: 'Festa / noite' },
];

export const WARMTH = [
  { id: 1, label: 'Leve', hint: 'regata, camiseta fina, short, sandália' },
  { id: 2, label: 'Média', hint: 'camisa, malha fina, calça, tênis' },
  { id: 3, label: 'Quente', hint: 'moletom, tricô, casaco grosso, bota' },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const CAT = byId(CATEGORIES);
const COL = byId(COLORS);
const OCC = byId(OCCASIONS);

export const catById = (id) => CAT[id];
export const colorById = (id) => COL[id];
export const occById = (id) => OCC[id];
