// Helpers mínimos de DOM compartilhados pelas telas.

export const $ = (sel) => document.querySelector(sel);

// Folha modal (bottom sheet). build(close) devolve o conteúdo; onClose roda ao fechar.
export function openSheet(build, onClose) {
  const dlg = h('dialog', { class: 'sheet' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose?.();
  };
  dlg.addEventListener('close', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.append(h('div', { class: 'body' }, build(close)));
  document.body.append(dlg);
  dlg.showModal();
  document.activeElement?.blur(); // evita abrir o teclado no celular
  return { dlg, close };
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}
