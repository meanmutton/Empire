/**
 * Splash screen: the key art (a landscape version, and a portrait one for phones), the title and a Play
 * button. It opens the game; later returns to the menu skip it.
 */
import tallUrl from '../assets/splash-tall.webp';
import wideUrl from '../assets/splash-wide.webp';
import { button, clear, h } from '../dom';
import { injectStyles } from '../styles';
import { openHelp } from './help';

export { tallUrl as splashTall, wideUrl as splashWide };

export function showSplash(root: HTMLElement, onPlay: () => void, version: string): void {
  injectStyles();
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    splash.classList.add('leaving');
    window.setTimeout(onPlay, 260);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  const splash = h('div', { class: 'splash' },
    h('img', { class: 'splash-art wide', src: wideUrl, alt: '' }),
    h('img', { class: 'splash-art tall', src: tallUrl, alt: '' }),
    h('div', { class: 'splash-shade' }),
    h('div', { class: 'splash-title' },
      h('div', { class: 'splash-name' }, 'EMPIRE'),
      h('div', { class: 'splash-tag' }, 'A game of galactic conquest')),
    h('div', { class: 'splash-actions' },
      button('Play', go, { cls: 'primary splash-play' }),
      h('div', { class: 'splash-links' },
        h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); openHelp(); } }, 'How to play'),
        h('span', null, ` · v${version}`))));
  clear(root).append(splash);
  window.addEventListener('keydown', onKey);
}
