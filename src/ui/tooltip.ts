/**
 * Tooltips. Every element with a `title` (or `data-tip`) gets a styled tooltip instead of the browser's slow,
 * plain one: shown quickly on hover, and on touch screens by pressing and holding. Rich tooltips (several
 * lines, colours) attach content with `setTip`. `infoTip` makes a small ⓘ that shows its text on hover, click
 * or tap, for explanations that used to be paragraphs on screen.
 */
type TipContent = string | (() => HTMLElement | string);

const rich = new WeakMap<Element, TipContent>();
let box: HTMLElement | null = null;
let current: Element | null = null;
let showTimer = 0;
let pressTimer = 0;
let swallowClick = false;

/** Gives an element a tooltip (text, or a function that builds the content when shown). */
export function setTip<T extends Element>(el: T, content: TipContent): T {
  rich.set(el, content);
  el.setAttribute('data-tip', typeof content === 'string' ? content : '…');
  el.removeAttribute('title');
  return el;
}

/** A small ⓘ that shows `content` on hover, click or tap. */
export function infoTip(content: TipContent, label = 'More information'): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'info-tip';
  el.textContent = 'i';
  el.setAttribute('aria-label', label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (current === el && box?.classList.contains('show')) hide(); else show(el);
  });
  return setTip(el, content);
}

function tipFor(el: Element): TipContent | null {
  if (rich.has(el)) return rich.get(el)!;
  const t = el.getAttribute('data-tip');
  return t && t !== '…' ? t : null;
}

/** The nearest element with a tooltip, turning a native `title` into ours on the way. */
function target(from: EventTarget | null): Element | null {
  let el = from instanceof Element ? from : null;
  while (el && el !== document.body) {
    const title = el.getAttribute('title');
    if (title) { el.setAttribute('data-tip', title); el.removeAttribute('title'); }
    if (el.hasAttribute('data-tip') && tipFor(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function ensureBox(): HTMLElement {
  if (!box) {
    box = document.createElement('div');
    box.className = 'tooltip';
    box.setAttribute('role', 'tooltip');
    document.body.appendChild(box);
  }
  return box;
}

function show(el: Element): void {
  const content = tipFor(el);
  if (!content || !el.isConnected) return;
  const b = ensureBox();
  b.replaceChildren();
  const c = typeof content === 'string' ? content : content();
  if (typeof c === 'string') b.textContent = c; else b.append(c);
  current = el;
  b.classList.add('show');
  // Above the element if there is room, else below; kept inside the window.
  const r = el.getBoundingClientRect();
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let x = r.left + r.width / 2 - bw / 2;
  x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
  let y = r.top - bh - 8;
  if (y < 8) y = r.bottom + 8;
  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(Math.min(y, window.innerHeight - bh - 8))}px`;
}

export function hideTip(): void { hide(); }

function hide(): void {
  window.clearTimeout(showTimer);
  current = null;
  box?.classList.remove('show');
}

/** Wires tooltips for the whole page (once). */
export function installTooltips(): void {
  if (typeof document === 'undefined' || (document as unknown as { _empireTips?: boolean })._empireTips) return;
  (document as unknown as { _empireTips?: boolean })._empireTips = true;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e.target);
    if (el === current) return;
    window.clearTimeout(showTimer);
    if (!el) { hide(); return; }
    showTimer = window.setTimeout(() => show(el), current ? 0 : 220);
  }, true);
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch' || !current) return;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (to && (current.contains(to) || box?.contains(to))) return;
    if (to && target(to) === current) return;
    hide();
  }, true);
  // Touch: press and hold shows the tooltip (and the press does not also click).
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') { if (!(e.target instanceof Element && e.target.closest('.info-tip'))) hide(); return; }
    hide();
    const el = target(e.target);
    if (!el) return;
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => { show(el); swallowClick = true; }, 450);
  }, true);
  const cancel = () => window.clearTimeout(pressTimer);
  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
  window.addEventListener('blur', hide);
}
