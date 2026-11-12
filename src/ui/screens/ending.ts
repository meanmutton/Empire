/**
 * The victory and defeat screens: full-screen key art with the big word on top, who won or why you lost,
 * and two buttons: look at the final galaxy, or leave. Shown once when a game ends.
 */
import { button, h } from '../dom';
import type { Ending } from '../ending-text';
import { injectStyles } from '../styles';
import defeatUrl from '../assets/ending-defeat.webp';
import victoryUrl from '../assets/ending-victory.webp';

export function showEnding(root: HTMLElement, ending: Ending, onLook: () => void, onQuit?: () => void): void {
  injectStyles();
  let done = false;
  const close = (then?: () => void) => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    screen.classList.add('leaving');
    window.setTimeout(() => { screen.remove(); then?.(); }, 260);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(onLook); } };
  const word = ending.kind === 'victory' ? 'Victory' : 'Defeat';
  const screen = h('div', { class: `ending ${ending.kind}`, role: 'dialog', 'aria-label': word },
    h('img', { class: 'ending-art', src: ending.kind === 'victory' ? victoryUrl : defeatUrl, alt: '' }),
    h('div', { class: 'ending-shade' }),
    h('div', { class: 'ending-title' },
      h('div', { class: 'ending-word' }, word),
      h('div', { class: 'ending-tag' }, ending.headline),
      h('div', { class: 'ending-detail' }, ending.detail)),
    h('div', { class: 'ending-actions' },
      button('See the galaxy', () => close(onLook), { cls: 'primary' }),
      onQuit ? button('Leave to title', () => close(onQuit)) : null));
  root.append(screen);
  window.addEventListener('keydown', onKey);
}
