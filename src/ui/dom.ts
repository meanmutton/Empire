/** Tiny DOM helpers (no framework). */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'disabled' || k === 'checked' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = !!v;
      else if (k === 'value') (el as unknown as HTMLInputElement).value = String(v);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): HTMLElement {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function button(label: Child, onClick: () => void, opts: { cls?: string; disabled?: boolean; title?: string } = {}): HTMLButtonElement {
  return h('button', { class: `btn ${opts.cls ?? ''}`, disabled: opts.disabled, title: opts.title, onclick: (e: Event) => { e.stopPropagation(); onClick(); } }, label);
}

let toastTimer: number | undefined;
export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast' });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = `show ${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el!.className = ''; }, 2600);
}

/** Open dialogs, newest last: Esc closes the newest. */
const openModals: (() => void)[] = [];
let escBound = false;

/** Lets Esc close a non-modal panel (newest first, together with dialogs). Returns an unregister. */
export function onEscape(close: () => void): () => void {
  ensureEscape();
  openModals.push(close);
  return () => { const i = openModals.indexOf(close); if (i >= 0) openModals.splice(i, 1); };
}

function ensureEscape(): void {
  if (escBound) return;
  escBound = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openModals.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openModals[openModals.length - 1]();
  }, true);
}

export function modal(title: string, body: HTMLElement, opts: { wide?: boolean; onClose?: () => void } = {}): { close: () => void; root: HTMLElement } {
  ensureEscape();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    const i = openModals.indexOf(close);
    if (i >= 0) openModals.splice(i, 1);
    opts.onClose?.();
  };
  openModals.push(close);
  const overlay = h('div', { class: 'modal-overlay', onclick: (e: Event) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal ${opts.wide ? 'wide' : ''}` },
      h('div', { class: 'modal-head' }, h('div', { class: 'modal-title' }, title), button('✕', close, { cls: 'ghost' })),
      h('div', { class: 'modal-body' }, body)));
  document.body.appendChild(overlay);
  return { close, root: overlay };
}

export function bar(frac: number, color: string): HTMLElement {
  const f = Math.max(0, Math.min(1, frac));
  return h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${f * 100}%;background:${color}` }));
}

/** True on touch-first devices (phones, tablets): no hover, no right-click, no keyboard shortcuts. */
export function isTouch(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

/** Whether a dialog is open (keyboard shortcuts for the map stand down while one is). */
export function dialogOpen(): boolean {
  return !!document.querySelector('.modal-overlay');
}
